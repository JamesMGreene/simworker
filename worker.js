// IIFE/Closure to prevent global pollution
(function() {

  "use strict";

  // Check if Workers are already defined; if so, bail out of this polyfill
  var hasDedicatedWorkers = "Worker" in window && typeof window.Worker !== "undefined" && window.Worker !== null;
  if (hasDedicatedWorkers) {
    return;
  }


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

  
  function defineWorker(self) {
    var window = self;
    var document = window.document;

    var EventTarget = window.EventTarget || (function() {
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

          if (!this._listeners[type]) {
            this._listeners[type] = {
              capturing: [],
              bubbling: []
            };
          }
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
          if (this._listeners[type] && this._listeners[type]["capturing"].length === 0 && this._listeners[type]["bubbling"].length === 0) {
            delete this._listeners[type];
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

          // Handle `stopImmediatePropagation`
          var immediatePropagationStopped = false;
          event.stopImmediatePropagation = (function(stopImmediatePropagationFn) {
            return function() {
              immediatePropagationStopped = true;
              if (stopImmediatePropagationFn) {
                stopImmediatePropagationFn.call(event);
              }
            };
          })(event.stopImmediatePropagation);
          if (!event.stopPropagation) {
            event.stopPropagation = function() { };
          }
          if (typeof event.defaultPrevented !== "boolean") {
            event.defaultPrevented = false;
          }
          if (!event.preventDefault) {
            event.preventDefault = function() {
              event.defaultPrevented = true;
            };
          }

          var phases = ["capturing", "bubbling"],
              listeners = this._listeners[type];
          if (listeners) {
            for (var p = 0, pLen = phases.length; p < pLen; p++) {
              for (var i = 0, len = listeners[phases[p]].length; i < len; i++) {
                //
                // TODO: Monitor for the `stopImmediatePropagation` here...?
                //
                listeners[phases[p]][i].call(this, event);
                if (immediatePropagationStopped) {
                  break;
                }
              }
              if (immediatePropagationStopped) {
                break;
              }
            }
          }
          // NOTE:
          // Do NOT need to forward the event to other listeners by invoking `fireEvent` as these
          // are only attached to Worker objects, not DOM elements!
        }
      };
      return EventTarget;
    })(),

    //
    // Custom private stuff
    //

    function getUriOrigin(uri) {
      var origin,
          protocolDelimiterIndex = uri.indexOf("//");
      if (protocolDelimiterIndex !== -1) {
        origin = uri.slice(0, uri.indexOf("/", protocolDelimiterIndex + 2));
        if (origin.toLowerCase() === "file://") {
          origin = "file://localhost";
        }
      }
      return origin;
    }

    function removeRelativeDirsFromUri(uri) {
      var previousSlashIndex,
          uriWithoutDotDirs = uri.replace(/\/.\//g, "/"),
          uriParentDotDirIndex = uri.indexOf("/../");
      while (uriParentDotDirIndex !== -1) {
        previousSlashIndex = uri.slice(0, uriParentDotDirIndex).lastIndexOf("/");
        uri = uri.slice(0, previousSlashIndex) + uri.slice(uriParentDotDirIndex + 3);
        uriParentDotDirIndex = uri.indexOf("/../");
      }
      if (uri.slice(0, 8).toLowerCase() === "file:///") {
        uri = "file://localhost/" + uri.slice(8);
      }
      return uri;
    }

    /**
    * Resolve any URI to an absolute URI. If no origin is present, then
    * the base origin of the current page will be implied.
    */
    function resolveUri(uri) {
      if (typeof uri !== "string") {
        return null;
      }
      var firstChar, path, query,
          absoluteUri = uri,
          origin = getUriOrigin(uri);
      if (!origin) {
        origin = getUriOrigin(getDocumentBaseURI());
        firstChar = uri.charAt(0);

        // Absolute path. Relative to origin.
        if (firstChar === "/") {
          absoluteUri = origin + uri;
        }
        // Relative to current page in some fashion...
        else {
          path = window.location.pathname;
          path = (path && path.charAt(0) !== "/" ? "/" : "") + path;

          // Fragment identifier (hash). Relative to the current page's full URI, including query string!
          if (firstChar === "#") {
            query = window.location.search;
            query = (query && query.charAt(0) !== "?" ? "?" : "") + query;
            absoluteUri = origin + path + query + uri;
          }
          // Query string (search). Relative to the current page's path.
          else if (firstChar === "?") {
            absoluteUri = origin + path + uri;
          }
          // Non-absolute path. Relative to the current page's parent directory.
          else {
            absoluteUri = origin + path.slice(0, path.lastIndexOf("/") + 1) + uri;
          }
        }
      }
      return removeRelativeDirsFromUri(absoluteUri);
    }

    function getUriDir(uri) {
      return !uri ? "" : (uri = uri.split("#")[0].split("?")[0]).slice(0, uri.lastIndexOf("/") + 1);
    }

    function getDocumentBaseURI() {
      var tmp,
          baseURI = getUriDir(document.baseURI);
      if (!baseURI && (tmp = document.getElementsByTagName("base")).length && (tmp = tmp[0].href)) {
        baseURI = getUriDir(tmp);
      }
      return baseURI || getUriDir(window.location.href);
    }

    function getScriptBaseURI() {
      var tmp,
          baseURI = "";
      if (document.currentScript && document.currentScript.src) {
        baseURI = getUriDir(document.currentScript.src);
      }
      // If EVERY script tag has a `src` attribute AND shares the same baseURI
      if (!baseURI &&
          (tmp = document.getElementsByTagName("script")) &&
          (tmp = (function(scripts) {
            var tmp, tmpBaseURI;
            for (var i = 0, len = scripts.length; i < len; i++) {
              if (!scripts[i].src) {
                tmpBaseURI = null;
                break;
              }
              else {
                tmp = getUriDir(resolveUri(scripts[i].src));
                if (tmp) {
                  tmpBaseURI = tmpBaseURI || tmp;
                  if (tmp !== tmpBaseURI) {
                    tmpBaseURI = null;
                    break;
                  }
                  tmp = null;
                }
              }
            }
            return tmpBaseURI;
          })(tmp)) &&
          tmp
      ) {
        baseURI = tmp;
      }
      else if (window.Worker.baseURI) {
        baseURI = window.Worker.baseURI;
      }
      else {
        baseURI = getDocumentBaseURI();
      }

      // If we don't have it now... just give up
      if (!baseURI) {
        throw new Error("Worker.js could not determine the script baseURI.");
      }

      return baseURI;
    }

    function createDedicatedWorkerFrame() {
      var worker = this;
      if (!worker._privates.frame) {
        var iframe = document.createElement("iframe");
        iframe.style.cssText = "width: 0; height: 0; border: 0; visibility: hidden;";
        iframe.className = "DedicatedWorker";
        iframe.id = worker._privates.id;

        // Attach the Worker instance to the iframe as a DOM property for easy access
        iframe._worker = worker;

        iframe.src = 'javascript:document.open().domain = "' + getDocumentDomain() + '"; void(0);';
        var firstScriptTag = document.getElementsByTagName("script")[0];
        firstScriptTag.parentNode.insertBefore(iframe, firstScriptTag);
        var doc = iframe.contentWindow.document;
        doc.write(
          '<!DOCTYPE html>\n' +
          '<html>\n' +
          '<head>\n' +
          '  <meta charset="UTF-8" />\n' +
          '  <base href="' + worker._privates.baseURI + '" />\n' +
          '  <title>Worker.js Frame</title>\n' +
          '  <script type="text/javascript">\n' +
          '    /* Store references to a few global objects that we need but are going to overwrite */\n' +
          '    var __DedicatedWorkerGlobalScope__ = {\n' +
          '      window: window,\n' +
          '      parent: window.parent,\n' +
          '      location: window.location,\n' +
          '      document: window.document,\n' +
          '      workerScriptName: "' + worker._privates.scriptName + '"\n' +
          '    };\n' +
          '    window.onload = ' +
    (function() {
      /* Inherit JSON serialization methods */
      self.JSON = self.JSON || window.parent.JSON;

      /* Inherit binary encoding methods */
      self.btoa = self.btoa || window.parent.btoa;
      self.atob = self.atob || window.parent.atob;

      /* Define the Worker API (for potential sub-Workers) and inherit the baseURI */
      self.Worker = window.parent.Worker._defineWorker(self);
      self.Worker.baseURI = window.parent.Worker.baseURI;

      /* Anything that needs direct access to the global scope needs to be done via a re-entrant script load */
      var dedicatedWorkerGlobalScopeScript = document.createElement("script");
      dedicatedWorkerGlobalScopeScript.type = "text/javascript";
      /*
      * WARNING: This part of the polyfill CANNOT be wrapped in a closure/IIFE as it MUST have
      * direct access to the global scope to override methods such as `postMessage` cross-browser.
      */
      dedicatedWorkerGlobalScopeScript.text = "";
      dedicatedWorkerGlobalScopeScript.onload = dedicatedWorkerGlobalScopeScript.onreadystatechange = function() {
        if (dedicatedWorkerGlobalScopeScript.readyState && !/^(?:loaded|complete)$/.test(dedicatedWorkerGlobalScopeScript.readyState)) {
          return;
        }
        dedicatedWorkerGlobalScopeScript.onload = dedicatedWorkerGlobalScopeScript.onreadystatechange = null;
        dedicatedWorkerGlobalScopeScript.parentNode.removeChild(dedicatedWorkerGlobalScopeScript);
        dedicatedWorkerGlobalScopeScript = null;

        /* Chain-load the actual Worker script */
        var workerScript = self.__DedicatedWorkerGlobalScope__.document.createElement("script");
        workerScript.type = "text/javascript";
        workerScript.src = self.__DedicatedWorkerGlobalScope__.workerScriptName;
        workerScript.onload = workerScript.onreadystatechange = function() {
          if (workerScript.readyState && !/^(?:loaded|complete)$/.test(workerScript.readyState)) {
            return;
          }
          workerScript.onload = workerScript.onreadystatechange = null;
          workerScript.parentNode.removeChild(workerScript);
          workerScript = null;

          /* Request any queued messages from `parent`, then "open for business" */
          self.__DedicatedWorkerGlobalScope__.window.frameElement._ready = true;
        };
        self.__DedicatedWorkerGlobalScope__.document.body.appendChild(workerScript);
      };
      document.body.appendChild(dedicatedWorkerGlobalScopeScript);
    }) +
          ';\n' +
          '  </script>\n' +
          '</head>\n' +
          '<body></body>\n' +
          '</html>'
        );

            '(function() {' +
              'var dedicatedWorkerGlobalScope = document.createElement(\\"script\\");' +
              //
              // NOTE:
              // This part of the polyfill CANNOT be wrapped in a closure/IIFE as it must have direct access to the
              // global scope in order to be able to override the key methods like `postMessage` cross-browser.
              //
              'dedicatedWorkerGlobalScope.text = \\"' +
                /*
                DedicatedWorkerGlobalScope = {
                  postMessage: function([serializable] message, [optional, non-serializable, SEQUENCE (array)] transfer) {},
                  importScripts: function(scriptNames...) {},
                  close: function() { },

                  onmessage: null -> function(messageEvent) { },
                  onerror: null -> function(errorEvent) { },
                  onoffline: null -> function() { },
                  ononline: null -> function() { },

                  self: self,
                  location: self.location,
                  navigator: self.navigator,  // add `.onLine` property

                  setTimeout,
                  clearInterval,
                  setInterval,
                  clearTimeout,
                  btoa: function(str) {},
                  atob: function(str) {}
                };
                */
                'var __workerGlobalScope__ = {' +
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
                '  helpers: {' +
                '    importScript: function(scriptPathRelativeToBaseURI) {' +
                '      var path = \\\\"' + worker._privates.baseURI + '\\\\" + scriptPathRelativeToBaseURI;' +
                '      var scriptTag = document.createElement(\\\\"script\\\\");' +\
                '      scriptTag.src = path;' +
                '      scriptTag.type = \\\\"text/javascript\\\\";' +
                '      document.body.appendChild(scriptTag);' +
                '    }' +
                '  }' +
                '};' +
                'var location = (function(uri) {' +
                '  var fakeUri = {};' +
                '  var uriProps = [\\\\"href\\\\", \\\\"origin\\\\", \\\\"protocol\\\\", \\\\"host\\\\", \\\\"hostname\\\\", \\\\"port\\\\", \\\\"pathname\\\\", \\\\"search\\\\", \\\\"hash\\\\"];' +
                '  for (var i = 0, len = uriProps.length; i < len; i++) {' +
                '    if (uriProps[i] in uri) {' +
                '      fakeUri[uriProps[i]] = uri[uriProps[i]];' +
                '    }' +
                '  }' +
                '  if (!(\\\\"origin\\\\" in fakeUri)) {' +
                '    fakeUri.origin = fakeUri.protocol + \\\\"//\\\\" + fakeUri.host;' +
                '  }' +
                '  return fakeUri;' +
                '})(self.location);' +
                '' +
                'function postMessage(data, rawData) {' +
                '  var message = {' +
                '    source: self,' +
                '    data: data,' +
                '    ports: null,' +
                '    domain: \\\\"\\\\",' +
                '    origin: \\\\"\\\\",' +
                '    lastEventId: \\\\"\\\\"' +
                '  };' +
                '  self.frameElement._worker._receiveMessage(JSON.stringify(message));' +
                '}' +
                '' +
                'function close() {' +
                '  self.frameElement._worker.terminate();' +
                '}' +
                '' +
                'function importScripts() {' +
                '  for (var i = 0, len = arguments.length; i < len; i++) {' +
                '    if (typeof arguments[i] === \\\\"string\\\\" && arguments[i]) {' +
                '      __workerGlobalScope__.helpers.importScript(arguments[i]);' +
                '    }' +
                '    else {' +
                '      throw new TypeError(\\\\"Arguments passed  to `importScripts` must be non-empty strings. Argument #\\\\" + i + \\\\" was not: \\\\" + arguments[i]);' +
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
              '\\";' +
              'dedicatedWorkerGlobalScope.type = \\"text/javascript\\";' +
              'document.body.appendChild(dedicatedWorkerGlobalScope);' +
              '' +
              'var work = document.createElement(\\"script\\");' +
              'work.src = \\"' + worker._privates.scriptName + '\\";' +
              'work.type = \\"text/javascript\\";' +
              'document.body.appendChild(work);' +
            '})();' +
          '">'

        doc.close();

        worker._privates.frame = iframe;
      }
    }

    function destroyDedicatedWorkerFrame() {
      var worker = this;
      if (worker._privates.frame) {
        var iframe = worker._privates.frame;
        if (iframe && iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }

        worker._privates.frame = iframe = null;
      }
    }

    function getFrameWindow(frame, window) {
      var win = null;
      if (frame) {
        if ("contentWindow" in frame && frame.contentWindow) {
          win = frame.contentWindow;
        }
        else if ("contentDocument" in frame && frame.contentDocument && frame.contentDocument.defaultView) {
          win = frame.contentDocument.defaultView;
        }
        else if (window && "frames" in window && window.frames && window.frames.length) {
          for (var i = 0, len = window.frames.length; i < len; i++) {
            if (window.frames[i].frameElement === frame) {
              win = window.frames[i];
              break;
            }
          }
        }
      }
      return win;
    }

    var createDedicatedWorkerId = (function() {
      var workerId = 0;
      return function createDedicatedWorkerId() {
        return 'DedicatedWorkerFrame_' + (workerId++) + '_' + (new Date()).getTime();
      };
    })();

    // Define the `Worker` class for the current `window`
    function Worker(workerScript) {
      // Enforce that a new instance is created even if the consumer doesn't use the `new` keyword
      if (!(this instanceof Worker)) {
        return new Worker(workerScript);
      }

      var worker = this;

      // Normal own properties
      worker.onmessage = null;
      worker.onerror = null;

      // Private properties
      worker._privates = {
        id: __workerParentGlobalScope__.helpers.createDedicatedWorkerId(),
        baseURI: __workerParentGlobalScope__.helpers.getScriptBaseURI(),
        scriptName: workerScript
      };

      // Create the worker frame
      __workerParentGlobalScope__.helpers.createDedicatedWorkerFrame.call(worker);
    }

    Worker.prototype = new EventTarget();
    Worker.prototype.constructor = Worker;

    Worker.prototype.postMessage = function postMessage(data) {
      if (this._privates.frame) {
        var messageEventData = {
          data: JSON.stringify(data),
          source: window,
          type: "message",
          ports: null,
          domain: "",
          origin: "",
          lastEventId: ""
        };
        if (this._privates.frame._ready === true) {
          var dedicatedWorkerGlobalScope = getFrameWindow(this._privates.frame, window);
          if (dedicatedWorkerGlobalScope && dedicatedWorkerGlobalScope.dispatchEvent) {
            dedicatedWorkerGlobalScope.dispatchEvent(messageEventData);
          }
        }
        else {
          this._privates.queue = this._privates.queue || [];
          this._privates.queue.push(messageEventData);
        }
      }
      //
      // TODO: What happens when `postMessage` is called after `terminate`? Throw an error?
      //
    };

    Worker.prototype.terminate = function terminate() {
      // Destroy the worker frame
      destroyDedicatedWorkerFrame.call(this);
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
    Worker._defineWorker = defineWorker;

    return Worker;
  }

  window.Worker = defineWorker(window);
}

})();