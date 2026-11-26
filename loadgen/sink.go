package main

import (
	"bytes"
	"fmt"
	"runtime"
	"syscall"
)

// sink is one thread that answers every request head with the same bytes. It
// parses nothing and reads no request bodies. What a request costs it is what
// the kernel costs, which is the floor for every single-threaded server.
func sink(addr string, size int) error {
	runtime.LockOSThread()
	sa, err := parseAddr(addr)
	if err != nil {
		return err
	}
	l, err := syscall.Socket(syscall.AF_INET, syscall.SOCK_STREAM, 0)
	if err != nil {
		return err
	}
	syscall.SetsockoptInt(l, syscall.SOL_SOCKET, syscall.SO_REUSEADDR, 1)
	if err := syscall.Bind(l, sa); err != nil {
		return err
	}
	if err := syscall.Listen(l, 1024); err != nil {
		return err
	}
	syscall.SetNonblock(l, true)
	answer := []byte(fmt.Sprintf(
		"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: %d\r\n\r\n%s",
		size, bytes.Repeat([]byte("x"), size)))
	p, err := newPoller()
	if err != nil {
		return err
	}
	p.add(l)
	fmt.Println(`{"event":"listening"}`)
	buf := make([]byte, 64<<10)
	var out []byte
	for {
		err := p.wait(true, func(fd int) {
			if fd == l {
				for {
					c, _, err := syscall.Accept(l)
					if err != nil {
						return
					}
					syscall.SetNonblock(c, true)
					syscall.SetsockoptInt(c, syscall.IPPROTO_TCP, syscall.TCP_NODELAY, 1)
					p.add(c)
				}
			}
			n, err := syscall.Read(fd, buf)
			if n <= 0 {
				if err != syscall.EAGAIN {
					syscall.Close(fd)
				}
				return
			}
			out = out[:0]
			for range bytes.Count(buf[:n], crlf2) {
				out = append(out, answer...)
			}
			syscall.Write(fd, out)
		})
		if err != nil {
			return err
		}
	}
}
