package main

import "syscall"

type poller struct {
	kq     int
	events []syscall.Kevent_t
}

func newPoller() (*poller, error) {
	kq, err := syscall.Kqueue()
	return &poller{kq: kq, events: make([]syscall.Kevent_t, 256)}, err
}

func (p *poller) add(fd int) error {
	var ev syscall.Kevent_t
	syscall.SetKevent(&ev, fd, syscall.EVFILT_READ, syscall.EV_ADD)
	_, err := syscall.Kevent(p.kq, []syscall.Kevent_t{ev}, nil, nil)
	return err
}

// wait calls ready for each readable descriptor. It returns at once when block
// is false, and otherwise waits for at most a millisecond.
func (p *poller) wait(block bool, ready func(fd int)) error {
	var timeout syscall.Timespec
	if block {
		timeout.Nsec = 1e6
	}
	n, err := syscall.Kevent(p.kq, nil, p.events, &timeout)
	if err != nil {
		if err == syscall.EINTR {
			return nil
		}
		return err
	}
	for i := range n {
		ready(int(p.events[i].Ident))
	}
	return nil
}

func (p *poller) close() { syscall.Close(p.kq) }
