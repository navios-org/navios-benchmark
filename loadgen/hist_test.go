package main

import (
	"math"
	"testing"
)

func TestRoundTripStaysWithinOnePercent(t *testing.T) {
	for v := uint64(1); v < 1<<40; v = v*3/2 + 1 {
		got := valueOf(indexOf(v))
		if rel := math.Abs(float64(got)-float64(v)) / float64(v); rel > 0.008 {
			t.Fatalf("%d came back as %d (%.2f %%)", v, got, rel*100)
		}
	}
}

func TestIndexIsMonotonic(t *testing.T) {
	last := -1
	for v := uint64(0); v < 1<<20; v++ {
		i := indexOf(v)
		if i < last {
			t.Fatalf("index of %d went back from %d to %d", v, last, i)
		}
		last = i
	}
}

func TestQuantiles(t *testing.T) {
	h := newHist()
	for v := uint64(1); v <= 100_000; v++ {
		h.record(v)
	}
	for _, q := range []float64{0.5, 0.9, 0.99, 0.999} {
		want := q * 100_000
		if rel := math.Abs(float64(h.quantile(q))-want) / want; rel > 0.01 {
			t.Fatalf("q%v is %d, want about %v", q, h.quantile(q), want)
		}
	}
	if h.max != 100_000 || h.min != 1 {
		t.Fatalf("min/max are %d/%d", h.min, h.max)
	}
}
