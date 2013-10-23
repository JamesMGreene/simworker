// IIFE/Closure to prevent global pollution
(function() {

"use strict";


if (!("Worker" in window) || typeof window.Worker === "undefined" || window.Worker === null) {

  // Enforce JSON support
  if (typeof JSON !== "object" || JSON === null) {
    throw new Error("Worker.js depends on the `JSON` object, which was not found.");
  }
  else if (typeof JSON.stringify !== "function" && !(typeof JSON.stringify === "object" && JSON.stringify && JSON.stringify.call && JSON.stringify.apply)) {
    throw new Error("Worker.js depends on the `JSON.stringify` method, which was not found.");
  }
  else if (typeof JSON.parse !== "function" && !(typeof JSON.parse === "object" && JSON.parse && JSON.parse.call && JSON.parse.apply)) {
    throw new Error("Worker.js depends on the `JSON.parse` method, which was not found.");
  }

  function createWorkerParentGlobalScope(window) {
    return {
      //
      // Important globals to hang on to as we may be overriding them later
      //
      global: {
        window: window,
        document: window.document,
        EventTarget: window.EventTarget
      },

      //
      // Feature test results
      //
      features: {
        defineProperty: {
          worksOnDom: (function() {
            var canDo = false;
            if (typeof window.Object.defineProperty === "function") {
              var test = window,
                  testKey = "onerror",
                  originalValue = test[testKey];
              try {
                var testData = null,
                    dummyFn = function dummyFn() {};
                window.Object.defineProperty(test, testKey, {
                  set: function(value) {
                    testData = value;
                  },
                  get: function() {
                    return testData;
                  },
                  configurable: true
                });
                canDo = (testKey in test) && (testData === null) && (test[testKey] = dummyFn) && (testData === dummyFn) && (test[testKey] === dummyFn);
              }
              catch (e) {
                canDo = false;
              }
              finally {
                if (canDo) {
                  Object.defineProperty(test, testKey, {
                    value: originalValue,
                    writable: true,
                    configurable: true
                  });
                }
                else {
                  test[testKey] = originalValue;
                }
              }
            }
            return canDo;
          })(),
          //
          // TODO: Probably don't need this anymore. Delete it if appropriate.
          //
          worksOnJsObjects: (function() {
            var canDo = false;
            if (typeof Object.defineProperty === "function") {
              try {
                var test = {},
                    testData = null,
                    testKey = "onerror";
                Object.defineProperty(test, testKey, {
                  set: function(value) {
                    testData = value;
                  },
                  get: function() {
                    return testData;
                  }
                });
                canDo = (testKey in test) && (testData === null) && (test[testKey] = "x") && (testData === "x") && (test[testKey] === "x");
              }
              catch (e) {
                canDo = false;
              }
            }
            return canDo;
          })()
        }
      },

      //
      // Important polyfills
      //
      polyfills: {
        EventTarget: window.EventTarget ? null : (function() {
          function EventTarget() {
            if (!(this instanceof EventTarget)) {
              return new EventTarget();
            }
            this._listeners = {};
          }
          EventTarget.prototype = {
            constructor: EventTarget,
            addEventListener: function addEventListener(type, listener, useCapture) {
              if (typeof type !== "string" || !type) {
                throw new TypeError("`type` must be a non-empty string");
              }
              if (typeof listener !== "function") {
                throw new TypeError("`listener` must be a function");
              }
              if (typeof useCapture !== "boolean" && typeof useCapture !== "undefined") {
                throw new TypeError("`useCapture` must be a boolean, or undefined");
              }

              // Default it
              useCapture = useCapture === true;

              this._listeners[type] = this._listeners[type] || {
                capturing: [],
                bubbling: []
              };
              this._listeners[type][useCapture ? "capturing" : "bubbling"].push(listener);
            },
            removeEventListener: function removeEventListener(type, listener, useCapture) {
              if (typeof type !== "string" || !type) {
                throw new TypeError("`type` must be a non-empty string");
              }
              if (typeof listener !== "function") {
                throw new TypeError("`listener` must be a function");
              }
              if (typeof useCapture !== "boolean" && typeof useCapture !== "undefined") {
                throw new TypeError("`useCapture` must be a boolean, or undefined");
              }

              // Default it
              useCapture = useCapture === true;

              var phase = useCapture ? "capturing" : "bubbling",
                  typedListeners = this._listeners[type] && this._listeners[type][phase];
              if (typedListeners && typedListeners.length) {
                for (var i = typedListeners.length; i--; ) {
                  if (typedListeners[i] === listener) {
                    typedListeners.splice(i, 1);
                  }
                }
              }
            },
            dispatchEvent: function dispatchEvent(event) {
              if (!event) {
                throw new TypeError("`event` was empty");
              }
              if (typeof event.type !== "string" || !event.type) {
                throw new TypeError("`event` must have a `type` property with a non-empty string value");
              }

              // Default it
              event.target = event.target || this;

              var phases = ["capturing", "bubbling"],
                  listeners = this._listeners[type];
              if (listeners) {
                for (var p = 0, pLen = phases.length; p < pLen; p++) {
                  for (var i = 0, len = listeners[phases[p]].length; i < len; i++) {
                    listeners[phases[p]][i].call(this, event);
                  }
                }
              }
            }
          };
          return EventTarget;
        })()
      },

      //
      // Custom private stuff
      //
      helpers: {
        getUriDomain: function(baseUri) {
          var delimiterIndex, domain;
          if (baseUri && (delimiterIndex = baseUri.indexOf("//")) && delimiterIndex !== -1) {
            if (delimiterIndex === 5 && baseUri.toLowerCase().slice(0, 8) === "file:///") {
              domain = "localhost";
            }
            else {
              domain = baseUri.slice(delimiterIndex + 2).split("#")[0].split("?")[0].split("/")[0];
            }
          }
          return domain;
        },

        getDocumentDomain: function() {
          var tmp,
              domain = __workerParentGlobalScope__.global.document.domain;
          if (!domain) {
            if (__workerParentGlobalScope__.global.document.baseURI) {
              domain = getUriDomain(__workerParentGlobalScope__.global.document.baseURI);
            }
            else if ((tmp = __workerParentGlobalScope__.global.document.getElementsByTagName("base")).length && (tmp = baseTags[0].href)) {
              domain = getUriDomain(tmp);
            }
          }
          if (!domain) {
            domain = __workerParentGlobalScope__.global.window.location.host;
          }
          return domain;
        },
        
        getDocumentOrigin: function() {
          return __workerParentGlobalScope__.global.window.location.protocol + "//" + __workerParentGlobalScope__.helpers.getDocumentDomain();
        },

        getUriPath: function(uri) {
          var hashIndex = uri.indexOf("#"),
              uriMinusHash = hashIndex !== -1 ? uri.slice(0, hashIndex) : uri,
              queryIndex = uriMinusHash.indexOf("?"),
              uriMinusQuery = queryIndex !== -1 ? uriMinusHash.slice(0, queryIndex) : uriMinusHash,
              lastSlashIndex = uriMinusQuery.lastIndexOf("/"),
              uriMinusFile = lastSlashIndex !== -1 ? uriMinusQuery.slice(0, lastSlashIndex + 1) : "";
          return uriMinusFile;
        },

        getBaseURI: function() {
          var tmp,
              baseURI = "";
          if (__workerParentGlobalScope__.global.document.currentScript && __workerParentGlobalScope__.global.document.currentScript.src) {
            baseURI = __workerParentGlobalScope__.helpers.getUriPath(__workerParentGlobalScope__.global.document.currentScript.src);
          }
          // If EVERY script tag with a `src` attribute shares the same baseURI
          if (!baseURI &&
              (tmp = __workerParentGlobalScope__.global.document.getElementsByTagName("script")) &&
              (tmp = (function(scripts) {
                var i, tmp, tmpBaseURI;
                for (var i = 0, len = scripts.length; i < len; i++) {
                  if (scripts[i].src) {
                    tmp = __workerParentGlobalScope__.helpers.getUriPath(scripts[i].src);
                  }
                  if (tmp) {
                    tmpBaseURI = tmpBaseURI || tmp;
                    if (tmp !== tmpBaseURI) {
                      tmpBaseURI = null;
                      break;
                    }
                    tmp = null;
                  }
                }
                return tmpBaseURI;
              })(tmp)) &&
              tmp
          ) {
            baseURI = __workerParentGlobalScope__.helpers.getUriPath(tmp);
          }
          if (!baseURI) {
            if (window.Worker.baseURI) {
              baseURI = window.Worker.baseURI;
            }
            else if (__workerParentGlobalScope__.global.document.baseURI) {
              baseURI = __workerParentGlobalScope__.helpers.getUriPath(__workerParentGlobalScope__.global.document.baseURI);
            }
            else if ((tmp = __workerParentGlobalScope__.global.document.getElementsByTagName("base")).length && (tmp = baseTags[0].href)) {
              baseURI = __workerParentGlobalScope__.helpers.getUriPath(tmp);
            }
          }
          if (!baseURI) {
            // Parse `window.location.href`
            baseURI = __workerParentGlobalScope__.helpers.getUriPath(__workerParentGlobalScope__.global.window.location.href);
          }

          // If we don't have it now... just give up
          if (!baseURI) {
            throw new Error("Worker.js could not determine the appropriate baseURI to use.");
          }

          return baseURI;
        },

        //
        // TODO: Load the script asynchronously
        //
        createDedicatedWorkerFrame: function() {
          var worker = this;
          if (!worker._privates.frame) {
            var iframe = __workerParentGlobalScope__.global.document.createElement("iframe");
            iframe.style.cssText = "width: 0; height: 0; border: 0; visibility: hidden;";
            iframe.className = "DedicatedWorker";
            iframe.id = worker._privates.id;
            iframe.src = 'javascript:document.open().domain = "' + __workerParentGlobalScope__.helpers.getDocumentDomain() + '"; void(0);';
            var firstScriptTag = __workerParentGlobalScope__.global.document.getElementsByTagName("script")[0];
            firstScriptTag.parentNode.insertBefore(iframe, firstScriptTag);
            var doc = iframe.contentWindow.document;
            doc.write(
              '<!DOCTYPE html>' +
              '<html>' +
              '<head>' +
                '<meta charset="UTF-8" />' +
                '<base href="' + worker._privates.baseURI + '" />' +
                '<title>Worker.js Frame</title>' +
              '</head>' +
              '<body onload="' +
                /*
                * TODO: Specify `onload`
                */
                '(function() {' +
                  'var workerGlobalScope = document.createElement(\"script\");' +
                  //
                  // NOTE:
                  // This part of the polyfill CANNOT be wrapped in a closure/IIFE as it must have direct access to the
                  // global scope in order to be able to override the key methods like `postMessage` cross-browser.
                  //
                  'workerGlobalScope.text = \"' +
                    'var __workerGlobalScope__ = {' +
                    '  workerId: \"' + worker._privates.id + '\",' +
                    '  global: {' +
                    '    location: window.location,' +
                    '    parent: window.parent,' +
                    '    postMessage: window.postMessage,' +
                    '    close: window.close,' +
                    '    addEventListener: window.addEventListener,' +
                    '    removeEventListener: window.removeEventListener,' +
                    '    dispatchEvent: window.dispatchEvent,' +
                    '    onmessage: window.onmessage,' +
                    '    onerror: window.onerror' +
                    '  },' +
                    '  handlers: {' +
                    '    message: function(e) {' +
                    '      ' +
                    '    },' +
                    '    error: function(e) {' +
                    '      ' +
                    '    }' +
                    '  },' +
                    '  counters: {' +
                    '    message: 0,' +
                    '    error: 0' +
                    '  },' +
                    '  helpers: {' +
                    '    importScript: function(scriptPathRelativeToBaseURI) {' +
                    '      var path = \"' + worker._privates.baseURI + '\" + scriptPathRelativeToBaseURI;' +
                    '      var scriptTag = document.createElement(\"script\");' +\
                    '      scriptTag.src = path;' +
                    '      scriptTag.type = \"text/javascript\";' +
                    '      document.body.appendChild(scriptTag);' +
                    '    }' +
                    '  }' +
                    '};' +
                    'var location = (function(uri) {' +
                    '  var fakeUri = {};' +
                    '  var uriProps = [\"href\", \"origin\", \"protocol\", \"host\", \"hostname\", \"port\", \"pathname\", \"search\", \"hash\"];' +
                    '  for (var i = 0, len = uriProps.length; i < len; i++) {' +
                    '    if (uriProps[i] in uri) {' +
                    '      fakeUri[uriProps[i]] = uri[uriProps[i]];' +
                    '    }' +
                    '  }' +
                    '  if (!(\"origin\" in fakeUri)) {' +
                    '    fakeUri.origin = fakeUri.protocol + \"//\" + fakeUri.host;' +
                    '  }' +
                    '  return fakeUri;' +
                    '})(__workerGlobalScope__.global.location);' +
                    '' +
                    'function postMessage(data) {' +
                    //
                    // TODO: Maybe just ditch the legitimate usage of `postMessage` altogether since it shouldn't actually be needed...?
                    //
                    '  if (__workerGlobalScope__.global.postMessage) {' +
                    '    return __workerGlobalScope__.global.parent.postMessage(JSON.stringify(data));' +
                    '  }' +
                    '  else {' +
                    '    return __workerGlobalScope__.global.parent.__workerParentGlobalScope__.workers[__workerGlobalScope__.workerId]._receiveMessage(JSON.stringify(data));' +
                    '  }' +
                    '}' +
                    '' +
                    'function close() {' +
                    '  __workerGlobalScope__.global.parent.' +
                    '}' +
                    '' +
                    'function importScripts() {' +
                    '  for (var i = 0, len = arguments.length; i < len; i++) {' +
                    '    if (typeof arguments[i] === \"string\" && arguments[i]) {' +
                    '      __workerGlobalScope__.helpers.importScript(arguments[i]);' +
                    '    }' +
                    '    else {' +
                    '      throw new TypeError(\"Arguments passed  to `importScripts` must be non-empty strings. Argument #\" + i + \" was not: \" + arguments[i]);' +
                    '    }' +
                    '  }' +
                    '}' +
                    '' +
                    'function addEventListener(type, handler, useCapture) {' +
                    '  if () {' +
                    '    ' +
                    '  }' +
                    '  else {' +
                    '    ' +
                    '  }' +
                    '}' +
                    '' +
                    'function removeEventListener(type, handler, useCapture) {' +
                    '  ' +
                    '}' +
                    '' +
                    'function dispatchEvent() {' +
                    '  ' +
                    '}' +
                    '' +
                    'var onmessage = null;' +
                    'var onerror = null;' +
                  '\";' +
                  'document.body.appendChild(workerGlobalScope);' +
                  '' +
                  'var work = document.createElement(\"script\");' +
                  'work.src = \"' + worker._privates.scriptName + '\";' +
                  'work.type = \"text/javascript\";' +
                  'document.body.appendChild(work);' +
                  '' +
                  'var ready = document.createElement(\"script\");' +
                  'ready.text = \"window.name = \\\"worker.ready\\\";\";' +
                  'ready.type = \"text/javascript\";' +
                  'document.body.appendChild(ready);' +
                '})();' +
              '">' +
              '</body>' +
              '</html>'
            );
            doc.close();

            worker._privates.frame = iframe;
          }
        },

        destroyDedicatedWorkerFrame: function() {
          var worker = this;
          if (worker._privates.frame) {
            var iframe = worker._privates.frame;
            if (iframe && iframe.parentNode) {
              iframe.parentNode.removeChild(iframe);
            }

            worker._privates.frame = iframe = null;
          }
        },

        getFrameWindow: function(frame) {
          var win = null;
          if (frame) {
            if ("contentWindow" in frame && frame.contentWindow) {
              win = frame.contentWindow;
            }
            else if ("contentDocument" in frame && frame.contentDocument && frame.contentDocument.defaultView) {
              win = frame.contentDocument.defaultView;
            }
            else if ("frames" in window && window.frames && window.frames.length) {
              for (var i = 0, len = window.frames.length; i < len; i++) {
                if (window.frames[i].frameElement === frame) {
                  win = window.frames[i];
                  break;
                }
              }
            }
          }
          return win;
        },

        createDedicatedWorkerId: (function() {
          var workerId = 0;
          return function() {
            return 'DedicatedWorkerFrame_' + (workerId++) + '_' + (new Date()).getTime();
          };
        })()
      },

      // Store temporary references to the Workers
      workers: {}
    };
  }

  
  function defineWorker(self) {

    // Define the `Worker` class for the current `window`
    function Worker(workerScript) {
      // Enforce that a new instance is created even if the consumer doesn't use the `new` keyword
      if (!(this instanceof Worker)) {
        return new Worker(workerScript);
      }

      // Create a global data store for the current `window` (using `self`, for Worker terminology sake)
      if (!self.__workerParentGlobalScope__) {
        self.__workerParentGlobalScope__ = createWorkerParentGlobalScope(self);
      }

      var worker = this;

      // Normal own properties
      worker.onmessage = null;
      worker.onerror = null;

      // Private properties
      worker._privates = {
        id: __workerParentGlobalScope__.helpers.createDedicatedWorkerId(),
        baseURI: __workerParentGlobalScope__.helpers.getBaseURI(),
        scriptName: workerScript
      };

      // Create the worker frame
      __workerParentGlobalScope__.helpers.createDedicatedWorkerFrame.call(worker);

      // Store a reference to it for redirecting `postMessage` calls
      __workerParentGlobalScope__.workers[worker._privates.id] = worker;
    }

    Worker.prototype = __workerParentGlobalScope__.global.EventTarget ? new __workerParentGlobalScope__.global.EventTarget() : new __workerParentGlobalScope__.polyfills.EventTarget();
    Worker.prototype.constructor = Worker;

    Worker.prototype.postMessage = function postMessage(data) {
      if (this._privates.frame) {
        var serializedData = JSON.stringify(data);
        var contentWindow = getFrameWindow(this._privates.frame);
        if (contentWindow && contentWindow.__workerGlobalScope__.global.postMessage) {
          if (contentWindow.name === "worker.ready") {
            contentWindow.__workerGlobalScope__.global.postMessage(serializedData);
          }
          else {
            this._privates.queue = this._privates.queue || [];
            this._privates.queue.push(serializedData);
          }
        }
        contentWindow.postMessage(JSON.stringify(data));
      }
      //
      // TODO: What happens when `postMessage` is called after `terminate`? Throw an error?
      //
    };

    Worker.prototype.terminate = function terminate() {
      // Remove its reference for redirecting `postMessage` calls
      delete __workerParentGlobalScope__.workers[this._privates.id];

      // Destroy the worker frame
      __workerParentGlobalScope__.helpers.destroyDedicatedWorkerFrame.call(this);
    };




        // Workers can spawn additional Workers!
        // TODO: This [probably] won't work right because of the `__workerParentGlobalScope__`.
        // TODO: Fix it... would be just to just includes this whole script in the Worker frame... but how?
        iframeWin.Worker = window.Worker;


        // If we can setup getters and setters on important DOM properties like `window.onerror`
        if (__workerParentGlobalScope__.features.defineProperty.worksOnDom) {
          var _onerror = iframeWin.onerror;
          Object.defineProperty(iframeWin, "onerror", {
            get: function() {
              return function(m, f, l, c, e) {
                if (typeof _onerror === "function") {
                  //
                  // TODO: Will probably need to convert this into a real/shimmed `ErrorEvent`
                  //
                  _onerror({
                    message: m,
                    filename: f,
                    lineno: l,
                    colno: c,
                    error: e
                  });
                }
                // Handle errors
                return true;
              };
            },
            set: function(value) {
              _onerror = value;
            },
            configurable: true
          });
        }
        // Otherwise add ghetto-fabulous monitoring of `iframeWin.onerror` to wrap it whenever it changes
        else {
          var lastOnError = iframeWin.onerror;
          iframeWin.setInterval(function() {
            if (iframeWin.onerror !== lastOnError) {
              if (typeof iframeWin.onerror === "function") {
                var _onerror = iframeWin.onerror;
                iframeWin.onerror = function(m, f, l, c, e) {
                  _onerror({
                    message: m,
                    filename: f,
                    lineno: l,
                    colno: c,
                    error: e
                  });
                  return true;
                };
              }
              lastOnError = iframeWin.onerror;
            }
          }, 0);
        }

        var postMessage = function postMessage(data) {
          if (typeof worker.onmessage === "function") {
            worker.onmessage.call(
              worker,
              {
                currentTarget: worker,
                timeStamp: (new Date()).getTime(),
                srcElement: worker,
                target: worker,
                data: data
              }
            );
          }
        };

    Worker.baseURI = "";

    return Worker;
  }

  window.Worker = defineWorker(window);
}

})();