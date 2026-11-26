package main

import "math/bits"

// A log-linear histogram of nanoseconds: 128 linear steps per power of two,
// which keeps the error of a recorded value below 0.8 %.
const (
	subBits    = 7
	subCount   = 1 << subBits
	bucketsLen = (64 - subBits + 1) * subCount
)

type hist struct {
	counts []uint32
	n      uint64
	sum    uint64
	min    uint64
	max    uint64
}

func newHist() *hist {
	return &hist{counts: make([]uint32, bucketsLen), min: ^uint64(0)}
}

func indexOf(v uint64) int {
	if v < subCount {
		return int(v)
	}
	shift := bits.Len64(v) - subBits - 1
	return (shift+1)<<subBits + int(v>>uint(shift)) - subCount
}

func valueOf(index int) uint64 {
	if index < subCount {
		return uint64(index)
	}
	shift := uint(index>>subBits) - 1
	low := (uint64(index&(subCount-1)) + subCount) << shift
	return low + (uint64(1)<<shift)/2
}

func (h *hist) record(v uint64) {
	h.counts[indexOf(v)]++
	h.n++
	h.sum += v
	if v < h.min {
		h.min = v
	}
	if v > h.max {
		h.max = v
	}
}

func (h *hist) merge(o *hist) {
	for i, c := range o.counts {
		h.counts[i] += c
	}
	h.n += o.n
	h.sum += o.sum
	if o.min < h.min {
		h.min = o.min
	}
	if o.max > h.max {
		h.max = o.max
	}
}

func (h *hist) quantile(q float64) uint64 {
	if h.n == 0 {
		return 0
	}
	rank := uint64(q*float64(h.n-1)) + 1
	var seen uint64
	for i, c := range h.counts {
		seen += uint64(c)
		if seen >= rank {
			v := valueOf(i)
			if v > h.max {
				return h.max
			}
			return v
		}
	}
	return h.max
}
