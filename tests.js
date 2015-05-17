"use strict";

// abb module may create aliases to setImmediate and setTimeout methods, so lolex
// will no longer be able to hijack them; to resolve this issue, abb is loaded
// while the global object contains proxies to the actual setImmediate/setTimeout
// methods

var realSetImmediate = setImmediate;
var realSetTimeout = setTimeout;
setImmediate = function() { return setImmediate.apply(this, arguments); };
setTimeout = function() { return setTimeout.apply(this, arguments); };

var abb = require("./abb");

setImmediate = realSetImmediate;
setTimeout = realSetTimeout;

var lolex = require("lolex");

function notCalled(test) {
    return function() {
        test.ok(false, "Should not be called");
    };
}

function called(test) {
    return function() {
        test.ok(true);
    };
}

function successfulBlock(test, result) {
    return abb.impl(function(success, error) {
        setTimeout(success.bind(null, result));
        return {abort: notCalled(test)}
    });
}

function failingBlock(test, reason) {
    return abb.impl(function(success, error) {
        setTimeout(error.bind(null, reason));
        return {abort: notCalled(test)}
    });
}

function abortedBlock(test) {
    return abb.impl(function(success, error) {
        return {abort: called(test)};
    });
}

exports.testSuccess = function(test) {
    abb.success(12).pipe(function(result) {
        test.strictEqual(result, 12);
        test.done();
    }, notCalled(test));
};

exports.testError = function(test) {
    var expectedReason = new Error;
    abb.error(expectedReason).pipe(notCalled(test), function(reason) {
        test.strictEqual(reason, expectedReason);
        test.done();
    });
};

exports.testImplWithSuccess = function(test) {
    abb.impl(function(success, error) {
        setTimeout(success.bind(null, 10));
        return {abort: notCalled(test)};
    }).pipe(function(result) {
        test.strictEqual(result, 10);
        test.done();
    }, notCalled(test));
};

exports.testImplWithError = function(test) {
    var expectedReason = new Error;
    abb.impl(function(success, error) {
        setTimeout(error.bind(null, expectedReason));
        return {abort: notCalled(test)};
    }).pipe(notCalled(test), function(reason) {
        test.strictEqual(reason, expectedReason);
        test.done();
    });
};

exports.testImplWithAbort = function(test) {
    var expectedReason = new Error;
    test.expect(1);
    abb.impl(function() {
        return {abort: called(test)};
    }).abort();
    test.done();
};

exports.testPipeWithSuccessSuccess = function(test) {
    abb.success(12).pipe(function(result) {
        return result * 2;
    }).pipe(function(result) {
        test.strictEqual(result, 24);
        test.done();
    }, notCalled(test));
};

exports.testPipeWithSuccessError = function(test) {
    var expectedReason = new Error;
    abb.success(12).pipe(function(result) {
        throw expectedReason;
    }).pipe(notCalled(test), function(reason) {
        test.strictEqual(reason, expectedReason);
        test.done();
    });
};

exports.testPipeWithErrorSuccess = function(test) {
    var reason = new Error;
    abb.error(reason).pipe(null, function(reason) {
        return 10;
    }).pipe(function(result) {
        test.strictEqual(result, 10);
        test.done();
    }, notCalled(test));
};

exports.testPipeWithErrorError = function(test) {
    var expectedReason1 = new Error, expectedReason2 = new Error;
    abb.error(expectedReason1).pipe(null, function(reason) {
        return expectedReason2;
    }).pipe(notCalled(test), function(reason) {
        test.strictEqual(reason, expectedReason2);
        test.done();
    });
};

exports.testPipeWithSuccessAbort = function(test) {
    var block;
    
    test.expect(2);
    
    block = abb.success().pipe(function() {
        test.ok(block);
        block.abort();
        setTimeout(test.done.bind(test));
        return abortedBlock(test);
    }, notCalled(test), notCalled(test));
};

exports.testPipeWithAbort = function(test) {
    test.expect(3);
    
    var implAborted = false;

    abb.impl(function() {
        return {abort: function() {
            test.ok(!implAborted);
            implAborted = true;
        }};
    }).pipe(notCalled(test), notCalled(test), function() {
        test.ok(implAborted);
        return abortedBlock(test);
    }).abort();
    
    test.done();
};

exports.testBlockSuppressWithSuccess = function(test) {
    abb.success(12).suppress(100).pipe(function(result) {
        test.strictEqual(result, 12);
        test.done();
    }, notCalled(test));
};

exports.testBlockSuppressWithError = function(test) {
    abb.error(new Error("error")).suppress(100).pipe(function(result) {
        test.strictEqual(result, 100);
        test.done();
    }, notCalled(test));
};

exports.testAnyWithNoArguments = function(test) {
    abb.any().pipe(function(result) {
        test.strictEqual(result, undefined);
        test.done();
    }, notCalled(test));
};

exports.testAnyWithEmptyArray = function(test) {
    abb.any([]).pipe(function(result) {
        test.strictEqual(result, undefined);
        test.done();
    }, notCalled(test));
};

exports.testAnyWithSuccessError = function(test) {
    abb.any(10, new Error).pipe(function(result) {
        test.strictEqual(result, 10);
        test.done();
    }, notCalled(test));
};

exports.testAnyWithErrorSuccess = function(test) {
    var expectedReason = new Error;
    abb.any([expectedReason, 10]).pipe(notCalled(test), function(reason) {
        test.strictEqual(reason, expectedReason);
        test.done();
    });
};

exports.testAnyAbortWithSuccess = function(test) {
    test.expect(2);
    abb.any(successfulBlock(test, 10), abortedBlock(test)).pipe(function(result) {
        test.strictEqual(result, 10);
        test.done();
    }, notCalled(test));
};

exports.testAnyAbortWithError = function(test) {
    var expectedReason = new Error;
    test.expect(2);
    abb.any(failingBlock(test, expectedReason), abortedBlock(test)).pipe(notCalled(test), function(reason) {
        test.strictEqual(reason, expectedReason);
        test.done();
    });
};

exports.testAnyWithAbort = function(test) {
    test.expect(2);
    abb.any(abortedBlock(test), abortedBlock(test)).abort();
    test.done();
};

exports.testAllWithNoArguments = function(test) {
    abb.all().pipe(function(result) {
        test.deepEqual(result, []);
        test.done();
    }, notCalled(test));
};

exports.testAllWithEmptyArray = function(test) {
    abb.all([]).pipe(function(result) {
        test.deepEqual(result, []);
        test.done();
    }, notCalled(test));
};

exports.testAllWithSuccess = function(test) {
    abb.all(10, 11, 12).pipe(function(result) {
        test.deepEqual(result, [10, 11, 12]);
        test.done();
    }, notCalled(test));
};

exports.testAllWithError = function(test) {
    var expectedReason = new Error;
    abb.all([10, expectedReason, 12]).pipe(notCalled(test), function(reason) {
        test.strictEqual(reason, expectedReason);
        test.done();
    });
};

exports.testAllAbortWithError = function(test) {
    var expectedReason = new Error;
    test.expect(2);
    abb.all(failingBlock(test, expectedReason), abortedBlock(test)).pipe(notCalled(test), function(reason) {
        test.strictEqual(reason, expectedReason);
        test.done();
    });
};

exports.testAllWithAbort = function(test) {
    test.expect(2);
    abb.all(abortedBlock(test), abortedBlock(test)).abort();
    test.done();
};

exports.testWait = function(test) {
    abb.wait(4).pipe(function(result) {
        test.strictEqual(result, undefined);
        test.done();
    }, notCalled(test));
};

exports.testWaitWithAbort = function(test) {
    abb.wait(4).abort();
    test.done();
};

exports.testTimeout = function(test) {
    abb.timeout(4).pipe(notCalled(test), function(reason) {
        test.done();
    });
};

exports.testRetry = function(test) {
    var counter = 0;
    
    abb.retry(function() {
        counter++;
        if (counter === 3) {
            return "ok";
        } else {
            throw new Error;
        }
    }, 3).pipe(function(result) {
        test.strictEqual(result, "ok");
        test.done();
    }, notCalled(test));
};

exports.testRetryWithLimitReached = function(test) {
    var counter = 0;
    
    abb.retry(function() {
        counter++;
        if (counter === 3) {
            return "ok";
        } else {
            throw new Error;
        }
    }, 2).pipe(notCalled(test), function(reason) {
        test.done();
    }, notCalled(test));
};

exports.testRetryWithAbort = function(test) {
    var counter = 0;
    
    var block = abb.retry(function() {
        counter++;
        switch (counter) {
        case 1:
            throw new Error;
        case 2:
            block.abort();
            setTimeout(test.done.bind(test));
            throw new Error;
        default:
            test.ok(false, "should not be reached");
        }
    }, 10);
};

exports.withFakeTime = {
    setUp: function(callback) {
        this.clock = lolex.install();
        callback();
    },
    
    tearDown: function(callback) {
        this.clock.uninstall();
        callback();
    },
    
    testWait: function(test) {
        var clock = this.clock, fired = false;
        
        abb.wait(100).pipe(function() {
            fired = true;
        });
        
        clock.tick(90);
        test.ok(!fired);
        
        clock.tick(10);
        test.ok(fired);
    
        test.done();
    }
};

