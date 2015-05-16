if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}

define(function() {
    "use strict";

    var forEach = Function.prototype.call.bind(Array.prototype.forEach);
    
    var firing = false;
    
    function getSetImmediateScheduler() {
        if (typeof setImmediate !== "function") {
            return null;
        }
        return setImmediate;
    }
    
    function getPromiseScheduler() {
        if (typeof Promise !== "function") {
            return null;
        }
        var p = new Promise(function(done) {
            done(null);
        });
        return function(func) {
            p.then(func);
        };
    }
    
    var schedule = getSetImmediateScheduler() || getPromiseScheduler() || setTimeout;
    
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
        firing = true;
        try {
            var block;
        
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
    
    proto._error = function(err) {
        if (this._state === RUNNING) {
            this._state = ERROR;
            this._value = err;
            if (this._onsuccess) {
                enqueue(this);
            }
        }
    };
    
    proto._tie = function(success, error) {
        if (this._state === DONE) {
            throw new Error("Already aborted");
        }
        this._onsuccess = success;
        this._onerror = error;
        if (this._state !== RUNNING) {
            enqueue(this);
        }
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
        } catch (err) {
            return error(err);
        }
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
                return value;
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
        var implBlock = new Block();
        try {
            var ret = func(implBlock._success.bind(implBlock), implBlock._error.bind(implBlock));
            if (ret && "abort" in ret) {
                implBlock._onabort = ret.abort.bind(ret);
            }
        } catch (err) {
            implBlock._error(err);
        }
        return implBlock;
    }
    
    function success(result) {
        var successBlock = createBlock();
        successBlock._success(result);
        return successBlock;
    }
    
    function error(err) {
        var errorBlock = createBlock();
        errorBlock._error(err);
        return errorBlock;
    }
    
    function all(blocks) {
        if (arguments.length !== 1) {
            blocks = arguments;
        }
        
        if (!blocks.length) {
            return success([]);
        }
        
        var remaining = blocks.length;
        var results = new Array(remaining);
        var allBlock = createBlock(abort);
        
        function abort() {
            forEach(blocks, function(block) {
                block._abort();
            });
        }
        
        forEach(blocks, function(block, i) {
            block._tie(function(result) {
                results[i] = result;
                --remaining;
                if (!remaining) {
                    allBlock._success(results);
                }
            }, function(err) {
                abort();
                allBlock._error(err);
            });
        });
        
        return allBlock;
    }
    
    function any(blocks) {
        if (arguments.length !== 1) {
            blocks = arguments;
        }
        
        if (!blocks.length) {
            return success();
        }
        
        var anyBlock = createBlock(abort);
        
        function abort() {
            forEach(blocks, function(block) {
                block._abort();
            });
        }
        
        forEach(blocks, function(block) {
            block._tie(function(result) {
                abort();
                anyBlock._success(result);
            }, function(err) {
                abort();
                anyBlock._error(err);
            });
        });
        
        return anyBlock;
    }
    
    function wait(delay) {
        var timer, waitBlock = createBlock(function() {
            clearTimeout(timer);
        });
        
        timer = setTimeout(waitBlock._success.bind(waitBlock), delay);
        
        return waitBlock;
    }
    
    function timeout(delay) {
        return wait(delay).pipe(function() {
            throw new Error("Timed out");
        });
    }
    
    function retry(func, limit) {
        if (limit === undefined) {
            limit = Infinity;
        }
        
        var retryBlock = createBlock(function() {
            block._abort();
        });
        
        var block;
        
        function step() {
            if (limit > 0) {
                block = runCont(func);
                block._tie(function(result) {
                    retryBlock._success(result);
                }, function() {
                    step();
                });
            } else {
                retryBlock._error(new Error("Retry limit reached"));
            }
        }
        
        step();
        
        return retryBlock;
    }
    
    function periodic(func, delay) {
        var block, timer = setInterval(function() {
            if (block) {
                return;
            }
        
            block = runCont(func);
            block._tie(function() {
                block = null;
            }, function(err) {
                abort();
                periodicBlock._error(err);
            });
        }, delay);
        
        var periodicBlock = createBlock(abort);
        
        function abort() {
            clearInterval(timer);
            if (block) {
                block._abort();
            }
        }
        
        return periodicBlock;
    }
    
    proto.pipe = function(onsuccess, onerror) {
        var thisBlock = this, contBlock = null, pipeBlock = createBlock(function() {
            if (contBlock) {
                contBlock._abort();
            } else {
                thisBlock._abort();
            }
        });
        
        var pipeSuccess = pipeBlock._success.bind(pipeBlock);
        var pipeError = pipeBlock._error.bind(pipeBlock);
        
        function setupCont(func, arg) {
            contBlock = runCont(func, [arg]);
            contBlock._tie(pipeSuccess, pipeError);
        }
        
        this._tie(
            onsuccess ? setupCont.bind(null, onsuccess) : pipeSuccess,
            onerror ? setupCont.bind(null, onerror) : pipeError
        );
        
        return pipeBlock;
    };
    
    proto.put = function(result) {
        return this.pipe(function() {
            return success(result);
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
