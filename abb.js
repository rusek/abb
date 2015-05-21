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
    
    function nop() {}
    
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
    
    function throwAway(err) {
        schedule(function() {
            throw err;
        });
    }
    
    var TRAP_UNARMED = {};
    
    var errorTrap = TRAP_UNARMED;
    
    function setErrorTrap() {
        var prev = errorTrap;
        errorTrap = null;
        return prev;
    }
    
    function restoreErrorTrap(prev) {
        var cur = errorTrap;
        errorTrap = prev;
        if (cur) {
            throw cur;
        }
    }
    
    function trapError(err) {
        if (errorTrap === TRAP_UNARMED) {
            throwAway(err);
        } else if (!errorTrap) {
            errorTrap = err;
        }
    }
    
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
        while ((block = head._next) !== null) {
            head._next = null;
            head._last = head;
            
            do {
                block._fire();
                block = block._next;
            }
            while (block !== null);
        }
        firing = false;
    }
    
    var RUNNING = 0, SUCCESS = 1, ERROR = 2, DONE = 3;
    
    function Block(onabort) {
        this._onabort = onabort || nop;
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
            throw new Error("Block is already aborted");
        }
        if (this._onsuccess) {
            throw new Error("Block already has a succesor");
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
        var running;
        
        running = this._state === RUNNING;
        this._state = DONE;
        if (running) {
            this._onabort();
        }
    };
    
    proto.abort = function() {
        var prev;
        
        if (this._onsuccess) {
            throw new Error("Cannot abort after setting a successor");
        }
        
        prev = setErrorTrap();
        this._abort();
        restoreErrorTrap(prev);
    };
    
    function _run() {
        try {
            return run.apply(null, arguments);
        } catch (err) {
            trapError(err);
            return error(err);
        }
    }
    
    function run(func) {
        return wrap(func.apply(null, slice(arguments, 1)));
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
            if (typeof value.then === "function") {
                return impl(value.then.bind(value));
            }
            break;
        }
        
        throw new Error("Cannot wrap " + value);
    }
    
    function impl(func) {
        var implBlock, ret;
    
        implBlock = new Block();
        ret = func(implBlock._success.bind(implBlock), implBlock._error.bind(implBlock));
        if (ret && typeof ret.abort === "function") {
            implBlock._onabort = function() {
                try {
                    ret.abort();
                } catch (err) {
                    trapError(err);
                }
            };
        }
        
        return implBlock;
    }
    
    function success(result) {
        var successBlock = new Block();
        successBlock._success(result);
        return successBlock;
    }
    
    function error(reason) {
        var errorBlock = new Block();
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
        allBlock = new Block(abort);
        
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
        anyBlock = new Block(abort);
        
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
                    return run(func).pipe(null, go);
                } else {
                    return error(new Error("Retry limit reached"));
                }
            })();
        } else {
            return (function go() {
                return run(func).pipe(null, go);
            })();
        }
    }
    
    function periodic(func, delay) {
        var barrier, timer;
        
        timer = setInterval(function() {
            if (barrier) {
                barrier();
                barrier = null;
            }
        }, delay);
        
        return (function go() {
            return impl(function(onsuccess) {
                barrier = onsuccess;
            }).pipe(func).pipe(go);
        })().exit(clearInterval.bind(null, timer));
    }
    
    proto.pipe = function(onsuccess, onerror, onabort) {
        var thisBlock = this._tieable(), contBlock, pipeBlock, pipeSuccess, pipeError;
        
        function setupCont(func, arg) {
            thisBlock = null;
            contBlock = _run(func, arg)._guardTie(pipeBlock, pipeSuccess, pipeError);
        }
        
        pipeBlock = new Block(function() {
            if (thisBlock) {
                thisBlock._abort();
                _run(onabort || nop)._abort();
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
            return run(func, true).put(result);
        }, function(reason) {
            run(func, false).abort();
            return error(reason);
        }, function() {
            run(func, false).abort();
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
        return this.pipe(function(result) {
            return func.apply(null, result);
        });
    };
    
    proto.fail = function(reason) {
        return this.pipe(function() {
            return error(reason);
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
        run: run,
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
