package main

import "testing"

func TestFraming(t *testing.T) {
	raw := "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\ncontent-length: 5\r\n\r\nhello" +
		"HTTP/1.1 404 Not Found\r\nTransfer-Encoding: chunked\r\n\r\n4\r\nwiki\r\n10;x=y\r\n0123456789abcdef\r\n0\r\nTrailer: 1\r\n\r\n" +
		"HTTP/1.1 204 No Content\r\nX: y\r\n\r\n" +
		"HTTP/1.1 500 Oops\r\nConnection: close\r\nContent-Length: 0\r\n\r\n" +
		"HTTP/1.1 201 Created\r\nContent-Length: 2\r\n\r\nok"
	want := []response{
		{status: 200, length: 5},
		{status: 404, length: 20},
		{status: 204},
		{status: 500, close: true},
		{status: 201, length: 2},
	}
	for step := 1; step <= len(raw); step++ {
		var p parser
		var got []response
		for i := 0; i < len(raw); i += step {
			data := []byte(raw[i:min(i+step, len(raw))])
			for len(data) > 0 {
				rest, done, err := p.feed(data)
				if err != nil {
					t.Fatalf("step %d: %v", step, err)
				}
				if done {
					got = append(got, p.current)
				}
				data = rest
			}
		}
		if len(got) != len(want) {
			t.Fatalf("step %d: %d responses, want %d", step, len(got), len(want))
		}
		for i := range want {
			if got[i] != want[i] {
				t.Fatalf("step %d, response %d: got %+v, want %+v", step, i, got[i], want[i])
			}
		}
	}
}

func TestMalformed(t *testing.T) {
	for _, raw := range []string{
		"HTTP/1.1 200 OK\r\nX: y\r\n\r\n",
		"garbage that is long enough\r\n\r\n",
		"HTTP/1.1 200 OK\r\nContent-Length: 1x\r\n\r\n",
		"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\nzz\r\n",
	} {
		var p parser
		if _, _, err := p.feed([]byte(raw)); err == nil {
			t.Fatalf("no error for %q", raw)
		}
	}
}
