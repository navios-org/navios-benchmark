package main

import (
	"bytes"
	"errors"
)

// The smallest HTTP/1.1 response parser that frames correctly: status,
// content-length, chunked, and the bodiless statuses. It is fed bytes as they
// arrive and keeps its place between two feeds.
type parser struct {
	state   int
	head    []byte // an incomplete head or chunk-size line
	left    int    // body bytes, or bytes of the chunk and its line break
	current response
}

type response struct {
	status int
	length int
	close  bool
}

const (
	inHead = iota
	inBody
	inChunkSize
	inChunk
	inTrailer
)

var (
	crlf2          = []byte("\r\n\r\n")
	errMalformed   = errors.New("malformed response")
	errNoFraming   = errors.New("response has neither content-length nor chunks")
	hContentLength = []byte("content-length")
	hTransfer      = []byte("transfer-encoding")
	hConnection    = []byte("connection")
	vChunked       = []byte("chunked")
	vClose         = []byte("close")
)

func (p *parser) reset() {
	*p = parser{head: p.head[:0]}
}

// feed consumes bytes until a response is complete or data runs out. It
// returns what it has not consumed, and whether a response is complete.
func (p *parser) feed(data []byte) (rest []byte, done bool, err error) {
	for {
		switch p.state {
		case inHead:
			var head []byte
			if len(p.head) == 0 {
				i := bytes.Index(data, crlf2)
				if i < 0 {
					p.head = append(p.head, data...)
					return nil, false, nil
				}
				head, data = data[:i], data[i+4:]
			} else {
				// the separator may straddle two feeds
				before := len(p.head)
				p.head = append(p.head, data...)
				from := max(before-3, 0)
				i := bytes.Index(p.head[from:], crlf2)
				if i < 0 {
					return nil, false, nil
				}
				head = p.head[:from+i]
				data = data[from+i+4-before:]
			}
			err = p.parseHead(head)
			p.head = p.head[:0]
			if err != nil {
				return nil, false, err
			}
			if p.state == inHead {
				return data, true, nil
			}
		case inBody:
			n := min(p.left, len(data))
			data = data[n:]
			if p.left -= n; p.left > 0 {
				return nil, false, nil
			}
			p.state = inHead
			return data, true, nil
		case inChunk:
			n := min(p.left, len(data))
			data = data[n:]
			if p.left -= n; p.left > 0 {
				return nil, false, nil
			}
			p.state = inChunkSize
		case inChunkSize, inTrailer:
			i := bytes.IndexByte(data, '\n')
			if i < 0 {
				p.head = append(p.head, data...)
				return nil, false, nil
			}
			p.head = append(p.head, data[:i]...)
			data = data[i+1:]
			line := bytes.TrimRight(p.head, "\r")
			p.head = p.head[:0]
			if p.state == inTrailer {
				if len(line) == 0 {
					p.state = inHead
					return data, true, nil
				}
				continue
			}
			size, err := chunkSize(line)
			if err != nil {
				return nil, false, err
			}
			if size == 0 {
				p.state = inTrailer
				continue
			}
			p.current.length += size
			p.left = size + 2
			p.state = inChunk
		}
	}
}

func chunkSize(line []byte) (int, error) {
	size, digits := 0, 0
	for _, c := range line {
		switch {
		case c >= '0' && c <= '9':
			size = size<<4 + int(c-'0')
		case c >= 'a' && c <= 'f':
			size = size<<4 + int(c-'a') + 10
		case c >= 'A' && c <= 'F':
			size = size<<4 + int(c-'A') + 10
		case (c == ';' || c == ' ') && digits > 0:
			return size, nil
		default:
			return 0, errMalformed
		}
		digits++
	}
	if digits == 0 {
		return 0, errMalformed
	}
	return size, nil
}

// parseHead leaves the state at inHead for a response without a body.
func (p *parser) parseHead(head []byte) error {
	if len(head) < 12 || head[0] != 'H' || head[8] != ' ' {
		return errMalformed
	}
	p.current = response{
		status: int(head[9]-'0')*100 + int(head[10]-'0')*10 + int(head[11]-'0'),
	}
	length, chunked := -1, false
	for {
		i := bytes.IndexByte(head, '\n')
		if i < 0 {
			break
		}
		head = head[i+1:]
		line := head
		if end := bytes.IndexByte(head, '\r'); end >= 0 {
			line = head[:end]
		}
		colon := bytes.IndexByte(line, ':')
		if colon < 0 {
			return errMalformed
		}
		name := line[:colon]
		switch len(name) {
		case len(hContentLength):
			if bytes.EqualFold(name, hContentLength) {
				length = 0
				for _, c := range bytes.TrimSpace(line[colon+1:]) {
					if c < '0' || c > '9' {
						return errMalformed
					}
					length = length*10 + int(c-'0')
				}
			}
		case len(hTransfer):
			if bytes.EqualFold(name, hTransfer) {
				chunked = bytes.EqualFold(bytes.TrimSpace(line[colon+1:]), vChunked)
			}
		case len(hConnection):
			if bytes.EqualFold(name, hConnection) {
				p.current.close = bytes.EqualFold(bytes.TrimSpace(line[colon+1:]), vClose)
			}
		}
	}
	switch {
	case p.current.status == 204 || p.current.status == 304:
	case chunked:
		p.state = inChunkSize
	case length < 0:
		return errNoFraming
	case length > 0:
		p.current.length = length
		p.left = length
		p.state = inBody
	}
	return nil
}
