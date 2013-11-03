# Worker.js

Polyfill for HTML5 [Dedicated] Web Workers.

Originally forked from the abandoned [timdream/simworker](https://github.com/timdream/simworker).


## What it does

This script creates a `Worker` interface for browsers without it. When you create 
an instance of it, it opens up an `iframe`, prepares the necessary functions, injects 
your script into it, listens for `worker.postMessage(...)` signals, and responds to trigger
`onmessage` events just like a native Worker would.


## What it doesn't do

The script doesn't do the magic of making the task execute in the background asynchronously.
Executions still block the UI thread and, like any other foreground functions, they are subjected
to runaway script timer restrictions imposed by the browser. Due to the reason addressed above, not
all programs that work well with native `Worker` instances are suitable for use with the
polyfilled `Worker` instances.

For a long-running calculation, you could modify the loop using `setTimeout(function() { ... }, 0);`
to prevent elongated periods of UI blocking.

Please check the tests for more examples.


## Usage

Same as the native Web Workers, with a few exceptions:

 1. The path of script for the native Web Workers is relative to the executing script rather than
    the document/`base` URL. The polyfill will attempt to detect this automatically using a handful
    of various techniques but it is, unfortunately, rarely possible to do in older browsers. If you
    want to guarantee that this path works correctly, you will need to manually specify it by
    setting `window.Worker.baseURI` to tell the `iframe` where to locate your worker script.
 2. Native Web Workers will be recycled automatically. The polyfilled `Worker` instances, however,
    live within an `iframe`. The `iframe` itself will not be cleaned up, so you _**must**_ do so
    by explicitly executing `worker.terminate();` when you are done with your `Worker`.
 3. If you want to use the `btoa` and `atob` encoding methods, you will need to polyfill support
    before creating your `Worker` instances, e.g. with [Base64.js](https://github.com/davidchambers/Base64.js)).


## Support
 - IE9
 - IE8
 - IE7 and below, _**if**_ you polyfill support for `JSON.stringify` and `JSON.parse`, e.g. with [JSON2](https://github.com/douglascrockford/JSON-js))
 - iOS Safari 4.0+

