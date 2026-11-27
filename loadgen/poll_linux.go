package main

import "syscall"

type poller struct {
	ep     int
	events []syscall.EpollEvent
}

func newPoller() (*poller, error) {
	ep, err := syscall.EpollCreate1(0)
	return &poller{ep: ep, events: make([]syscall.EpollEvent, 256)}, err
}

func (p *poller) add(fd int) error {
	return syscall.EpollCtl(p.ep, syscall.EPOLL_CTL_ADD, fd, &syscall.EpollEvent{Events: syscall.EPOLLIN, Fd: int32(fd)})
}

// wait calls ready for each readable descriptor. It returns at once when block
// is false, and otherwise waits for at most a millisecond.
func (p *poller) wait(block bool, ready func(fd int)) error {
	timeout := 0
	if block {
		timeout = 1
	}
	n, err := syscall.EpollWait(p.ep, p.events, timeout)
	if err != nil {
		if err == syscall.EINTR {
			return nil
		}
		return err
	}
	for i := range n {
		ready(int(p.events[i].Fd))
	}
	return nil
}

func (p *poller) close() { syscall.Close(p.ep) }
