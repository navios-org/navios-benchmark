// loadgen drives HTTP/1.1 load from a plan on stdin and prints one JSON event
// per line on stdout: start and end of the measured window, then the result.
//
//	loadgen run  < plan.json    drive load
//	loadgen sink <addr> <size>  a server that answers without doing any work,
//	                            to find out how fast this client can go
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"strconv"
)

func main() {
	if len(os.Args) < 2 {
		fail("usage: loadgen run|sink")
	}
	switch os.Args[1] {
	case "run":
		var p plan
		if err := json.NewDecoder(os.Stdin).Decode(&p); err != nil {
			fail("bad plan: " + err.Error())
		}
		if p.Threads > 0 {
			runtime.GOMAXPROCS(p.Threads)
		}
		if err := run(&p); err != nil {
			fail(err.Error())
		}
	case "sink":
		size, _ := strconv.Atoi(os.Args[3])
		if err := sink(os.Args[2], size); err != nil {
			fail(err.Error())
		}
	default:
		fail("unknown command " + os.Args[1])
	}
}

func fail(message string) {
	fmt.Fprintln(os.Stderr, "loadgen: "+message)
	os.Exit(1)
}
