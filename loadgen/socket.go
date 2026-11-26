package main

import (
	"errors"
	"fmt"
	"net"
	"strconv"
	"syscall"
	"time"
)

func parseAddr(addr string) (*syscall.SockaddrInet4, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, err
	}
	ip := net.ParseIP(host).To4()
	if ip == nil {
		return nil, fmt.Errorf("%s is not an IPv4 address", host)
	}
	sa := &syscall.SockaddrInet4{Addr: [4]byte(ip)}
	sa.Port, err = strconv.Atoi(port)
	return sa, err
}

// dial connects with a blocking socket, which on loopback takes no time worth
// saving, and hands it out non-blocking.
func dial(sa *syscall.SockaddrInet4) (int, error) {
	fd, err := syscall.Socket(syscall.AF_INET, syscall.SOCK_STREAM, 0)
	if err != nil {
		return -1, err
	}
	if err := syscall.Connect(fd, sa); err != nil {
		syscall.Close(fd)
		return -1, err
	}
	syscall.SetsockoptInt(fd, syscall.IPPROTO_TCP, syscall.TCP_NODELAY, 1)
	if err := syscall.SetNonblock(fd, true); err != nil {
		syscall.Close(fd)
		return -1, err
	}
	return fd, nil
}

// dialPatiently retries a connection that the server refuses or resets. That
// happens when many connections arrive while the server is still busy: macOS
// keeps at most kern.ipc.somaxconn (128) of them waiting to be accepted.
func dialPatiently(sa *syscall.SockaddrInet4, patience time.Duration) (int, error) {
	deadline := time.Now().Add(patience)
	wait := time.Millisecond
	for {
		fd, err := dial(sa)
		retry := errors.Is(err, syscall.ECONNRESET) || errors.Is(err, syscall.ECONNREFUSED) ||
			errors.Is(err, syscall.ETIMEDOUT)
		if err == nil || !retry || time.Now().After(deadline) {
			return fd, err
		}
		time.Sleep(wait)
		wait = min(wait*2, 100*time.Millisecond)
	}
}
