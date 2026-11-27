package main

import (
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"os"
	"runtime"
	"runtime/debug"
	"sort"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

type request struct {
	Name    string            `json:"name"`
	Method  string            `json:"method"`
	Path    string            `json:"path"`
	Headers map[string]string `json:"headers"`
	Body    string            `json:"body"`
	Status  int               `json:"status"`
	Weight  int               `json:"weight"`
}

type plan struct {
	Addr        string `json:"addr"`
	Connections int    `json:"connections"`
	// Threads each own a share of the connections.
	Threads  int `json:"threads"`
	Pipeline int `json:"pipeline"`
	// Block makes the threads sleep while nothing is readable. By default they
	// spin, so that the server's writes never pay for waking one.
	Block      bool `json:"block"`
	WarmupMs   int  `json:"warmupMs"`
	DurationMs int  `json:"durationMs"`
	// Rate is the requests per second of all connections together, for an
	// open-loop run. 0 is a closed loop: each connection sends its next request
	// when it has the answer to the last.
	Rate     float64   `json:"rate"`
	Seed     uint64    `json:"seed"`
	Requests []request `json:"requests"`
}

type latency struct {
	Mean float64 `json:"mean"`
	Min  float64 `json:"min"`
	P50  float64 `json:"p50"`
	P75  float64 `json:"p75"`
	P90  float64 `json:"p90"`
	P99  float64 `json:"p99"`
	P999 float64 `json:"p999"`
	Max  float64 `json:"max"`
}

type result struct {
	Event      string         `json:"event"`
	Seconds    float64        `json:"seconds"`
	Requests   uint64         `json:"requests"`
	RPS        float64        `json:"rps"`
	Bytes      uint64         `json:"bytes"`
	Statuses   map[int]uint64 `json:"statuses"`
	Unexpected uint64         `json:"unexpected"`
	Errors     uint64         `json:"errors"`
	Reconnects uint64         `json:"reconnects"`
	FirstError string         `json:"firstError,omitempty"`
	LatencyUs  latency        `json:"latencyUs"`
	// Late counts the requests of an open-loop run that were due while the
	// previous one of their connection was still in flight.
	Late    uint64 `json:"late"`
	Threads int    `json:"threads"`
	// BusyShare is the part of its time the busiest thread spent on requests
	// rather than polling. Near 1, this client was the bottleneck.
	BusyShare float64  `json:"busyShare"`
	PerSecond []uint64 `json:"perSecond"`
}

const (
	phaseWarmup int32 = iota
	phaseMeasure
	phaseDone
)

type connection struct {
	fd      int
	parser  parser
	out     []byte // what is still to be written
	sent    []int  // the requests in flight, oldest first
	begin   int64
	due     int64
	retryAt int64 // when to dial again, while there is no socket
	pending int
}

type thread struct {
	plan    *plan
	addr    *syscall.SockaddrInet4
	encoded [][]byte
	picks   []int
	rng     *rand.Rand
	poller  *poller
	now     func() int64
	conns   []*connection
	byFD    map[int]*connection
	buf     []byte
	batch   []byte

	hist       *hist
	statuses   [600]uint64
	unexpected uint64
	errors     uint64
	reconnects uint64
	late       uint64
	bytes      uint64
	busy       int64
	perSecond  []uint64
	firstError string
}

func encode(addr string, r request) []byte {
	s := r.Method + " " + r.Path + " HTTP/1.1\r\nHost: " + addr + "\r\n"
	names := make([]string, 0, len(r.Headers))
	for k := range r.Headers {
		names = append(names, k)
	}
	sort.Strings(names)
	for _, k := range names {
		s += k + ": " + r.Headers[k] + "\r\n"
	}
	if r.Body != "" {
		s += fmt.Sprintf("Content-Length: %d\r\n", len(r.Body))
	}
	return []byte(s + "\r\n" + r.Body)
}

func emit(v any) {
	json.NewEncoder(os.Stdout).Encode(v)
}

func run(p *plan) error {
	p.Pipeline = max(p.Pipeline, 1)
	p.Threads = min(max(p.Threads, 1), p.Connections)
	if p.Rate > 0 && p.Pipeline > 1 {
		return fmt.Errorf("pipelining is for closed-loop runs")
	}
	if len(p.Requests) == 0 || p.Connections < 1 {
		return fmt.Errorf("a plan needs requests and connections")
	}
	runtime.GOMAXPROCS(p.Threads + 1)
	// Nothing is allocated per request, so there is nothing to collect.
	debug.SetGCPercent(-1)

	addr, err := parseAddr(p.Addr)
	if err != nil {
		return err
	}
	encoded := make([][]byte, len(p.Requests))
	var picks []int
	for i, r := range p.Requests {
		encoded[i] = encode(p.Addr, r)
		for range max(r.Weight, 1) {
			picks = append(picks, i)
		}
	}

	var phase atomic.Int32
	var measureStart atomic.Int64
	epoch := time.Now()
	now := func() int64 { return int64(time.Since(epoch)) }

	threads := make([]*thread, p.Threads)
	for i := range threads {
		poller, err := newPoller()
		if err != nil {
			return err
		}
		threads[i] = &thread{
			plan: p, addr: addr, encoded: encoded, picks: picks, poller: poller, now: now,
			rng:       rand.New(rand.NewPCG(p.Seed, uint64(i))),
			byFD:      map[int]*connection{},
			buf:       make([]byte, 256<<10),
			hist:      newHist(),
			perSecond: make([]uint64, p.DurationMs/1000+2),
		}
	}
	interval := int64(0)
	if p.Rate > 0 {
		interval = int64(float64(p.Connections) * 1e9 / p.Rate)
	}
	started := now()
	for i := range p.Connections {
		t := threads[i%p.Threads]
		fd, err := dialPatiently(addr, 3*time.Second)
		if err != nil {
			return err
		}
		c := &connection{fd: fd, sent: make([]int, 0, p.Pipeline)}
		// Connections are spread over the interval instead of firing together.
		c.due = started + interval*int64(i)/int64(p.Connections)
		t.conns = append(t.conns, c)
		t.byFD[fd] = c
		if err := t.poller.add(fd); err != nil {
			return err
		}
	}

	var wg sync.WaitGroup
	failures := make([]error, p.Threads)
	for i, t := range threads {
		wg.Add(1)
		go func() {
			defer wg.Done()
			runtime.LockOSThread()
			failures[i] = t.loop(interval, &phase, &measureStart)
		}()
	}

	time.Sleep(time.Duration(p.WarmupMs) * time.Millisecond)
	t0 := now()
	measureStart.Store(t0)
	phase.Store(phaseMeasure)
	emit(map[string]string{"event": "start"})
	time.Sleep(time.Duration(p.DurationMs) * time.Millisecond)
	phase.Store(phaseDone)
	t1 := now()
	emit(map[string]string{"event": "end"})
	wg.Wait()
	for _, err := range failures {
		if err != nil {
			return err
		}
	}

	all := newHist()
	r := result{Event: "result", Statuses: map[int]uint64{}, Threads: p.Threads}
	r.Seconds = float64(t1-t0) / 1e9
	r.PerSecond = make([]uint64, p.DurationMs/1000)
	for _, t := range threads {
		all.merge(t.hist)
		for s, n := range t.statuses {
			if n > 0 {
				r.Statuses[s] += n
			}
		}
		for s := range r.PerSecond {
			r.PerSecond[s] += t.perSecond[s]
		}
		r.Unexpected += t.unexpected
		r.Errors += t.errors
		r.Reconnects += t.reconnects
		r.Late += t.late
		r.Bytes += t.bytes
		r.BusyShare = max(r.BusyShare, float64(t.busy)/float64(t1-t0))
		if r.FirstError == "" {
			r.FirstError = t.firstError
		}
	}
	r.Requests = all.n
	r.RPS = float64(all.n) / r.Seconds
	if all.n > 0 {
		us := func(v uint64) float64 { return float64(v) / 1e3 }
		r.LatencyUs = latency{
			Mean: float64(all.sum) / float64(all.n) / 1e3,
			Min:  us(all.min), P50: us(all.quantile(0.5)), P75: us(all.quantile(0.75)),
			P90: us(all.quantile(0.9)), P99: us(all.quantile(0.99)),
			P999: us(all.quantile(0.999)), Max: us(all.max),
		}
	}
	emit(r)
	return nil
}

func (t *thread) loop(interval int64, phase *atomic.Int32, measureStart *atomic.Int64) error {
	open := interval > 0
	now := t.now
	if !open {
		for _, c := range t.conns {
			c.begin = now()
			t.send(c)
		}
	}
	var at int64
	var current int32
	ready := func(fd int) {
		c := t.byFD[fd]
		if c == nil {
			return
		}
		t.receive(c, current, measureStart)
	}
	for {
		current = phase.Load()
		if current == phaseDone {
			for _, c := range t.conns {
				if c.fd >= 0 {
					syscall.Close(c.fd)
				}
			}
			t.poller.close()
			return nil
		}
		worked := false
		sendStart := now()
		for _, c := range t.conns {
			if c.fd < 0 && sendStart >= c.retryAt {
				t.reconnect(c)
			}
		}
		if open {
			at = sendStart
			for _, c := range t.conns {
				if c.fd < 0 || len(c.sent) > 0 || c.due > at {
					continue
				}
				worked = true
				c.begin = at
				c.due += interval
				t.send(c)
			}
		}
		for _, c := range t.conns {
			if len(c.out) > 0 {
				worked = true
				t.flush(c)
			}
		}
		pollStart := now()
		if worked && current == phaseMeasure {
			t.busy += pollStart - sendStart
		}
		any := false
		err := t.poller.wait(t.plan.Block && !worked && !open, func(fd int) {
			if !any {
				any = true
				pollStart = now()
			}
			ready(fd)
		})
		if err != nil {
			return err
		}
		if any && current == phaseMeasure {
			t.busy += now() - pollStart
		}
	}
}

// send picks the next requests of a connection and writes them.
func (t *thread) send(c *connection) {
	c.sent = c.sent[:0]
	if t.plan.Pipeline == 1 {
		pick := t.picks[0]
		if len(t.picks) > 1 {
			pick = t.picks[t.rng.IntN(len(t.picks))]
		}
		c.sent = append(c.sent, pick)
		c.out = t.encoded[pick]
	} else {
		c.out = nil
		for range t.plan.Pipeline {
			pick := t.picks[t.rng.IntN(len(t.picks))]
			c.sent = append(c.sent, pick)
			c.out = append(c.out, t.encoded[pick]...)
		}
	}
	c.pending = 0
	t.flush(c)
}

func (t *thread) flush(c *connection) {
	for len(c.out) > 0 {
		n, err := syscall.Write(c.fd, c.out)
		if n > 0 {
			c.out = c.out[n:]
		}
		if err == syscall.EAGAIN || err == syscall.EINTR {
			return // tried again in the next turn of the loop
		}
		if err != nil {
			t.broken(c, err)
			return
		}
	}
}

func (t *thread) receive(c *connection, current int32, measureStart *atomic.Int64) {
	n, err := syscall.Read(c.fd, t.buf)
	if n <= 0 {
		if err == syscall.EAGAIN || err == syscall.EINTR {
			return
		}
		if err == nil {
			err = fmt.Errorf("the server closed the connection")
		}
		t.broken(c, err)
		return
	}
	if current == phaseMeasure {
		t.bytes += uint64(n)
	}
	data := t.buf[:n]
	for len(data) > 0 {
		rest, done, err := c.parser.feed(data)
		if err != nil {
			t.broken(c, err)
			return
		}
		data = rest
		if !done {
			break
		}
		if c.pending >= len(c.sent) {
			t.broken(c, fmt.Errorf("a response that no request asked for"))
			return
		}
		res := c.parser.current
		expected := t.plan.Requests[c.sent[c.pending]].Status
		c.pending++
		at := t.now()
		if current == phaseMeasure {
			t.hist.record(uint64(max(at-c.begin, 1)))
			t.statuses[min(max(res.status, 0), 599)]++
			if res.status != expected {
				t.unexpected++
			}
			if second := (at - measureStart.Load()) / 1e9; second >= 0 && int(second) < len(t.perSecond) {
				t.perSecond[second]++
			}
		}
		if c.pending < len(c.sent) {
			continue
		}
		c.sent = c.sent[:0]
		if res.close {
			t.reconnect(c)
			return
		}
		if t.plan.Rate > 0 {
			if c.due <= at {
				// It was due while the connection was busy: waiting for the
				// previous answer is part of its latency.
				c.begin = c.due
				c.due += int64(float64(t.plan.Connections) * 1e9 / t.plan.Rate)
				if current == phaseMeasure {
					t.late++
				}
				t.send(c)
			}
			return
		}
		c.begin = at
		t.send(c)
		return
	}
}

func (t *thread) broken(c *connection, err error) {
	t.errors++
	if t.firstError == "" {
		t.firstError = err.Error()
	}
	t.reconnect(c)
}

// reconnect leaves the connection idle and, in a closed loop, sends on it.
func (t *thread) reconnect(c *connection) {
	if c.fd >= 0 {
		t.reconnects++
		delete(t.byFD, c.fd)
		syscall.Close(c.fd)
	}
	c.out, c.sent, c.pending = nil, c.sent[:0], 0
	c.parser.reset()
	fd, err := dial(t.addr)
	if err != nil {
		t.errors++
		if t.firstError == "" {
			t.firstError = err.Error()
		}
		c.fd = -1
		c.retryAt = t.now() + int64(time.Millisecond)
		return
	}
	c.fd = fd
	t.byFD[fd] = c
	if err := t.poller.add(fd); err != nil {
		t.errors++
		return
	}
	if t.plan.Rate == 0 {
		c.begin = t.now()
		t.send(c)
	}
}
