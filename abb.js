if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}

define(function() {
    "use strict";

    var map = Function.prototype.call.bind(Array.prototype.map);
    var slice = Function.prototype.call.bind(Array.prototype.slice);
    
    function present(arg) {
        return arg !== null && arg !== undefined;
    }
    
    var schedule = (function() {
        var helper;
    
        if (typeof setImmediate === "function") {
            return setImmediate;
        }
        
        
        if (typeof Promise === "function") {
            helper = new Promise(function(resolve) {
                resolve();
            });
            return function(func) {
                helper.then(func);
            };
        }
    
        return setTimeout;
    })();
    
    var firing = false;
    
    var head = {
        _next: null
    };
    head._last = head;
    
    function enqueue(block) {
        var empty = head._next === null;
    
        head._last._next = block;
        head._last = block;
        
        if (empty && !firing) {
            schedule(fire);
        }
    }
    
    function fire() {
        var block;
    
        firing = true;
        try {
            while ((block = head._next) !== null) {
                head._next = null;
                head._last = head;
                
                do {
                    block._fire();
                    block = block._next;
                }
                while (block !== null);
            }
        } finally {
            firing = false;
        }
    }
    
    var RUNNING = 0, SUCCESS = 1, ERROR = 2, DONE = 3;
    
    function Block() {
        this._onabort = null;
        this._onsuccess = null;
        this._onerror = null;
        this._state = RUNNING;
        this._value = null;
        this._next = null;
    }
    
    var proto = Block.prototype;
    
    proto._fire = function() {
        if (this._state === SUCCESS) {
            this._state = DONE;
            this._onsuccess(this._value);
        } else if (this._state === ERROR) {
            this._state = ERROR;
            this._onerror(this._value);
        }
    };
    
    proto._success = function(result) {
        if (this._state === RUNNING) {
            this._state = SUCCESS;
            this._value = result;
            if (this._onsuccess) {
                enqueue(this);
            }
        }
    };
    
    proto._error = function(reason) {
        if (this._state === RUNNING) {
            this._state = ERROR;
            this._value = reason;
            if (this._onsuccess) {
                enqueue(this);
            }
        }
    };
    
    proto._tieable = function() {
        if (this._state === DONE) {
            throw new Error("Already aborted");
        }
        if (this._onsuccess) {
            throw new Error("Already tied");
        }
        return this;
    };
    
    proto._tie = function(success, error) {
        this._onsuccess = success;
        this._onerror = error;
        if (this._state === SUCCESS || this._state === ERROR) {
            enqueue(this);
        }
        return this;
    };
    
    proto._guardTie = function(owner, success, error) {
        if (owner._state === DONE) {
            this._abort();
        } else {
            this._tie(success, error);
        }
        return this;
    };
    
    proto._abort = function() {
        if (this._state === RUNNING) {
            this._state = DONE;
            this._onabort();
        } else if (this._state !== DONE) {
            this._state = DONE;
        }
    };
    
    proto.abort = function() {
        if (this._onsuccess) {
            throw new Error("Successor has been set, can no longer abort");
        }
        this._abort();
    };
    
    function createBlock(abort) {
        var block = new Block();
        block._onabort = abort;
        return block;
    }
    
    function runCont(func, args) {
        try {
            return wrap(func.apply(null, args));
        } catch (reason) {
            return error(reason);
        }
    }
    
    function cont(func) {
        var ret;
        
        try {
            ret = func.apply(null, slice(arguments, 1));
        } catch (reason) {
            return error(reason);
        }
        return wrap(ret);
    }
    
    function wrap(value) {
        switch (typeof value) {
        case "boolean":
        case "number":
        case "string":
        case "undefined":
            return success(value);
        
        case "object":
            if (value === null) {
                return success(value);
            }
            if (value instanceof Block) {
                return value._tieable();
            }
            if (value instanceof Error) {
                return error(value);
            }
            if ("then" in value) {
                return impl(promise.then.bind(promise));
            }
            break;
        }
        
        throw new Error("Cannot wrap " + value);
    }
    
    function impl(func) {
        var implBlock, ret;
    
        implBlock = new Block();
        try {
            ret = func(implBlock._success.bind(implBlock), implBlock._error.bind(implBlock));
            if (ret && "abort" in ret) {
                implBlock._onabort = ret.abort.bind(ret);
            }
        } catch (reason) {
            implBlock._error(reason);
        }
        return implBlock;
    }
    
    function success(result) {
        var successBlock = createBlock();
        successBlock._success(result);
        return successBlock;
    }
    
    function error(reason) {
        var errorBlock = createBlock();
        errorBlock._error(reason);
        return errorBlock;
    }
    
    function all(blocks) {
        var remaining, results, allBlock;
    
        function abort() {
            blocks.forEach(function(block) {
                block._abort();
            });
        }
        
        if (arguments.length !== 1) {
            blocks = arguments;
        }
        
        if (!blocks.length) {
            return success([]);
        }
        
        blocks = map(blocks, wrap);
        remaining = blocks.length;
        results = new Array(remaining);
        allBlock = createBlock(abort);
        
        blocks.forEach(function(block, i) {
            block._tie(function(result) {
                results[i] = result;
                --remaining;
                if (!remaining) {
                    allBlock._success(results);
                }
            }, function(reason) {
                abort();
                allBlock._error(reason);
            });
        });
        
        return allBlock;
    }
    
    function any(blocks) {
        var anyBlock;
    
        function abort() {
            blocks.forEach(function(block) {
                block._abort();
            });
        }
        
        if (arguments.length !== 1) {
            blocks = arguments;
        }
        
        if (!blocks.length) {
            return success();
        }
        
        blocks = map(blocks, wrap);
        anyBlock = createBlock(abort);
        
        blocks.forEach(function(block) {
            block._tie(function(result) {
                abort();
                anyBlock._success(result);
            }, function(reason) {
                abort();
                anyBlock._error(reason);
            });
        });
        
        return anyBlock;
    }
    
    function wait(delay) {
        return impl(function(success) {
            return {
                abort: clearTimeout.bind(setTimeout(success, delay))
            };
        });
    }
    
    function timeout(delay) {
        return wait(delay).fail(new Error("Timed out"));
    }
    
    function retry(func, limit) {
        if (present(limit)) {
            return (function go() {
                if (limit-- > 0) {
                    return cont(func).pipe(null, go);
                } else {
                    return error(new Error("Retry limit reached"));
                }
            })();
        } else {
            return (function go() {
                return cont(func).pipe(null, go);
            });
        }
    }
    
    function periodic(func, delay) {
        var block, periodicBlock, timer;
        
        function abort() {
            clearInterval(timer);
            if (block) {
                block._abort();
            }
        }
        
        timer = setInterval(function() {
            if (block) {
                return;
            }
        
            block = runCont(func)._guardTie(periodicBlock, function() {
                block = null;
            }, function(reason) {
                abort();
                periodicBlock._error(reason);
            });
        }, delay);
        periodicBlock = createBlock(abort);
        
        return periodicBlock;
    }
    
    proto.pipe = function(onsuccess, onerror, onabort) {
        var thisBlock = this._tieable(), contBlock, pipeBlock, pipeSuccess, pipeError;
        
        function setupCont(func, arg) {
            thisBlock = null;
            contBlock = runCont(func, [arg])._guardTie(pipeBlock, pipeSuccess, pipeError);
        }
        
        pipeBlock = createBlock(function() {
            if (thisBlock) {
                thisBlock._abort();
                runCont(onabort)._abort();
            } else if (contBlock) {
                contBlock._abort();
            }
        });
        pipeSuccess = pipeBlock._success.bind(pipeBlock);
        pipeError = pipeBlock._error.bind(pipeBlock);
        
        thisBlock._tie(
            onsuccess ? setupCont.bind(null, onsuccess) : pipeSuccess,
            onerror ? setupCont.bind(null, onerror) : pipeError
        );
        
        return pipeBlock;
    };
    
    proto.exit = function(func) {
        return this.pipe(function(result) {
            return cont(func, true).put(result);
        }, function(reason) {
            cont(func, false).abort();
            return error(reason);
        }, function() {
            cont(func, false).abort();
        });
    };
    
    proto.map = function(func) {
        return this.pipe(function(result) {
            return all(map(result, func));
        });
    };
    
    proto.put = function(result) {
        return this.pipe(function() {
            return success(result);
        });
    };
    
    proto.modify = function(func) {
        return this.pipe(function(result) {
            return success(func(result));
        });
    };
    
    proto.unpack = function(func) {
        this.pipe(function(result) {
            return func.apply(null, result);
        });
    };
    
    proto.fail = function(reason) {
        return this.pipe(function() {
            throw reason;
        });
    };
    
    proto.timeout = function(delay) {
        return any(this, timeout(delay));
    };
    
    proto.suppress = function(result) {
        return this.pipe(null, function() {
            return success(result);
        });
    };

    return {
        all: all,
        any: any,
        cont: cont,
        error: error,
        impl: impl,
        periodic: periodic,
        retry: retry,
        success: success,
        timeout: timeout,
        wait: wait,
        wrap: wrap
    };
});
