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
    return abb.impl(function(success) {
        setTimeout(success.bind(null, result));
        return {abort: notCalled(test)};
    });
}

function failingBlock(test, reason) {
    return abb.impl(function(success, error) {
        setTimeout(error.bind(null, reason));
        return {abort: notCalled(test)};
    });
}

function abortedBlock(test) {
    return abb.impl(function() {
        return {abort: called(test)};
    });
}

function stepper() {
    var funcs = [], pos = 0;

    return function(i, func) {
        funcs[i] = func.bind.apply(func, [null].concat(Array.prototype.slice.call(arguments, 2)));
        while (funcs[pos]) {
            setImmediate(funcs[pos]);
            pos++;
        }
    };
}

exports.testSuccess = function(test) {
    abb.success(12).pipe(function(result) {
        test.strictEqual(result, 12);
        test.done();
    }, notCalled(test));
};

exports.testError = function(test) {
    var expectedReason = new Error();
    abb.error(expectedReason).pipe(notCalled(test), function(reason) {
        test.strictEqual(reason, expectedReason);
        test.done();
    });
};

exports.testWrapPrimitives = function(test) {
    abb.wrap().pipe(function(result) {
        test.strictEqual(result, undefined);

        return abb.wrap(null);
    }).pipe(function(result) {
        test.strictEqual(result, null);

        return abb.wrap(true);
    }).pipe(function(result) {
        test.strictEqual(result, true);

        return abb.wrap(17);
    }).pipe(function(result) {
        test.strictEqual(result, 17);

        return abb.wrap(NaN);
    }).pipe(function(result) {
        test.ok(isNaN(result));

        return abb.wrap("text");
    }).pipe(function(result) {
        test.strictEqual(result, "text");

        test.done();
    });
};

exports.testWrapError = function(test) {
    var expectedReason = new Error();
    abb.wrap(expectedReason).pipe(notCalled(test), function(reason) {
        test.strictEqual(reason, expectedReason);
        test.done();
    });
};

exports.testWrapInvalidArgument = function(test) {
    test.throws(function() {
        abb.wrap({});
    });

    test.throws(function() {
        var block = abb.success();
        block.pipe();
        abb.wrap(block);
    });

    test.throws(function() {
        var block = abb.success();
        block.abort();
        abb.wrap(block);
    });

    test.done();
};

exports.testAbortInvalidArgument = function(test) {
    test.throws(function() {
        var block = abb.success();
        block.pipe();
        block.abort();
    });

    test.done();
};

exports.testImplWithSuccess = function(test) {
    abb.impl(function(success) {
        setTimeout(success.bind(null, 10));
        return {abort: notCalled(test)};
    }).pipe(function(result) {
        test.strictEqual(result, 10);
        test.done();
    }, notCalled(test));
};

exports.testImplWithError = function(test) {
    var expectedReason = new Error();
    abb.impl(function(success, error) {
        setTimeout(error.bind(null, expectedReason));
        return {abort: notCalled(test)};
    }).pipe(notCalled(test), function(reason) {
        test.strictEqual(reason, expectedReason);
        test.done();
    });
};

exports.testImplWithAbort = function(test) {
    test.expect(1);
    abb.impl(function() {
        return {abort: called(test)};
    }).abort();
    test.done();
};

exports.testImplNoOnabortWithAbort = function(test) {
    abb.impl(function() {}).abort();
    test.done();
};

exports.testImplWithAbortAfterSuccess = function(test) {
    abb.impl(function(success) {
        success();
        return {abort: notCalled(test)};
    }).abort();
    test.done();
};

exports.testImplWithAbortAfterError = function(test) {
    abb.impl(function(error) {
        error(new Error());
        return {abort: notCalled(test)};
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
    var expectedReason = new Error();
    abb.success(12).pipe(function() {
        return expectedReason;
    }).pipe(notCalled(test), function(reason) {
        test.strictEqual(reason, expectedReason);
        test.done();
    });
};

exports.testPipeWithErrorSuccess = function(test) {
    abb.error(new Error()).pipe(null, function() {
        return 10;
    }).pipe(function(result) {
        test.strictEqual(result, 10);
        test.done();
    }, notCalled(test));
};

exports.testPipeWithErrorError = function(test) {
    var expectedReason1 = new Error(), expectedReason2 = new Error();
    abb.error(expectedReason1).pipe(null, function() {
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

exports.getPipeWithErrorAbort = function(test) {
    var block;

    test.expect(2);

    block = abb.error(new Error()).pipe(notCalled(test), function() {
        test.ok(block);
        block.abort();
        setTimeout(test.done.bind(test));
        return abortedBlock(test);
    }, notCalled(test));
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

exports.testPipeInvalidArgument = function(test) {
    test.throws(function() {
        var block = abb.success();
        block.pipe();
        block.pipe();
    });

    test.throws(function() {
        var block = abb.success();
        block.abort();
        block.pipe();
    });

    test.done();
};

exports.testThrowFromPipeAbort = function(test) {
    var err = new Error("oops");

    var block = abb.success().pipe(notCalled(test), notCalled(test), function() {
        throw err;
    });

    test.throws(block.abort.bind(block), /^oops$/);

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
    abb.any(10, new Error()).pipe(function(result) {
        test.strictEqual(result, 10);
        test.done();
    }, notCalled(test));
};

exports.testAnyWithErrorSuccess = function(test) {
    var expectedReason = new Error();
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
    var expectedReason = new Error();
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
    var expectedReason = new Error();
    abb.all([10, expectedReason, 12]).pipe(notCalled(test), function(reason) {
        test.strictEqual(reason, expectedReason);
        test.done();
    });
};

exports.testAllAbortWithError = function(test) {
    var expectedReason = new Error();
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
    abb.timeout(4).pipe(notCalled(test), function() {
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
            return new Error();
        }
    }, 3).pipe(function(result) {
        test.strictEqual(result, "ok");
        test.done();
    }, notCalled(test));
};

exports.testUnlimitedRetry = function(test) {
    var counter = 0;

    abb.retry(function() {
        counter++;
        if (counter === 3) {
            return "ok";
        } else {
            return new Error();
        }
    }).pipe(function(result) {
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
            return new Error();
        }
    }, 2).pipe(notCalled(test), function() {
        test.done();
    }, notCalled(test));
};

exports.testRetryWithAbort = function(test) {
    var counter = 0;

    var block = abb.retry(function() {
        counter++;
        switch (counter) {
        case 1:
            return new Error();
        case 2:
            block.abort();
            setTimeout(test.done.bind(test));
            return new Error();
        default:
            test.ok(false, "should not be reached");
        }
    }, 10);
};

exports.testPeriodicWithError = function(test) {
    var expectedReason = new Error();
    abb.periodic(failingBlock.bind(null, test, expectedReason), 1).pipe(notCalled(test), function(reason) {
        test.strictEqual(reason, expectedReason);
        test.done();
    });
};

exports.testBlockExitWithSuccessSuccess = function(test) {
    abb.success(1).exit(function(ok) {
        test.strictEqual(ok, true);
        return 2;
    }).pipe(function(result) {
        test.strictEqual(result, 1);
        test.done();
    }, notCalled(test));
};

exports.testBlockExitWithSuccessError = function(test) {
    var expectedReason = new Error();
    abb.success(1).exit(function(ok) {
        test.strictEqual(ok, true);
        return expectedReason;
    }).pipe(notCalled(test), function(reason) {
        test.strictEqual(reason, expectedReason);
        test.done();
    });
};

exports.testBlockExitWithError = function(test) {
    var expectedReason = new Error();
    test.expect(3);

    abb.error(expectedReason).exit(function(ok) {
        test.strictEqual(ok, false);
        return abortedBlock(test);
    }).pipe(notCalled(test), function(reason) {
        test.strictEqual(reason, expectedReason);
        test.done();
    });
};

exports.testBlockExitWithAbort = function(test) {
    test.expect(2);

    abb.success().exit(function(ok) {
        test.strictEqual(ok, false);
        return abortedBlock(test);
    }).abort();

    test.done();
};

exports.testBlockMap = function(test) {
    abb.success([1, 2, 3]).map(function(result) {
        return abb.success(result * 2);
    }).pipe(function(result) {
        test.deepEqual(result, [2, 4, 6]);
        test.done();
    }, notCalled(test));
};

exports.testBlockMapWithLimit = function(test) {
    var block, step = stepper(), got = [];

    block = abb.success([1, 2, 3]).map(function(result) {
        function inStepExpectGot(order, expectedGot) {
            return abb.impl(function(success) {
                step(order, function() {
                    test.deepEqual(got, expectedGot);
                    success(-result);
                });
            });
        }

        got.push(result);
        switch (result) {
        case 1:
            return inStepExpectGot(1, [1, 2]);

        case 2:
            return inStepExpectGot(0, [1, 2]);

        case 3:
            return inStepExpectGot(2, [1, 2, 3]);

        default:
            test.ok(false);
        }
    }, 2).pipe(function(result) {
        test.deepEqual(result, [-1, -2, -3]);
        test.done();
    }, notCalled(test));
};

exports.testBlockPutWithSuccess = function(test) {
    var expectedResult = {};
    abb.success(1).put(expectedResult).pipe(function(result) {
        test.strictEqual(result, expectedResult);
        test.done();
    }, notCalled(test));
};

exports.testBlockPutWithSuccess = function(test) {
    var expectedReason = new Error();
    abb.error(expectedReason).put(1).pipe(notCalled(test), function(reason) {
        test.strictEqual(reason, expectedReason);
        test.done();
    });
};

exports.testBlockModify = function(test) {
    var expectedResult = abb.success(1);

    abb.success(1).modify(function(result) {
        test.strictEqual(result, 1);
        return expectedResult;
    }).pipe(function(result) {
        test.strictEqual(result, expectedResult);
        test.done();
    }, notCalled(test));
};

exports.testBlockUnpack = function(test) {
    abb.success([1, 2, 3]).unpack(function() {
        var args = Array.prototype.slice.call(arguments); // copy as array
        test.deepEqual(args, [1, 2, 3]);
        return 4;
    }).pipe(function(result) {
        test.strictEqual(result, 4);
        test.done();
    }, notCalled(test));
};

exports.testBlockFailWithSuccess = function(test) {
    var expectedReason = new Error();
    abb.success().fail(expectedReason).pipe(notCalled(test), function(reason) {
        test.strictEqual(reason, expectedReason);
        test.done();
    });
};

exports.testBlockFailWithError = function(test) {
    var expectedReason = new Error();
    abb.error(expectedReason).fail(new Error()).pipe(notCalled(test), function(reason) {
        test.strictEqual(reason, expectedReason);
        test.done();
    });
};

exports.testBlockTimeout = function(test) {
    test.expect(2);

    abortedBlock(test).timeout(1).pipe(notCalled(test), function(reason) {
        test.ok(reason instanceof Error);
        test.done();
    });
};

exports.testBlockTimeoutWithSuccess = function(test) {
    abb.success(10).timeout(1).pipe(function(result) {
        test.strictEqual(result, 10);
        test.done();
    }, notCalled(test));
};

function createThenable(test) {
    return {
        then: function(resolved, rejected) {
            this.resolve = resolved;
            this.reject = rejected;

            return {
                then: notCalled(test)
            };
        }
    };
}

exports.withFakeTime = {
    setUp: function(callback) {
        this.clock = lolex.install();
        callback();
    },

    tearDown: function(callback) {
        this.clock.uninstall();
        callback();
    },

    testWrapThenable: function(test) {
        var thenable, expectedReason = new Error();

        test.expect(2);

        thenable = createThenable(test);

        abb.wrap(thenable).pipe(function(result) {
            test.strictEqual(result, "result");
        }, notCalled(test));

        thenable.resolve("result");
        this.clock.tick();

        thenable = createThenable(test);

        abb.wrap(thenable).pipe(notCalled(test), function(reason) {
            test.strictEqual(reason, expectedReason);
        }, notCalled(test));

        thenable.reject(expectedReason);
        this.clock.tick();

        test.done();
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
    },

    testPeriodic: function(test) {
        var clock = this.clock, block, success;

        block = abb.periodic(function() {
            test.ok(!success);
            return abb.impl(function(onsuccess) {
                success = function() { success = null; onsuccess(); };
            });
        }, 100);

        clock.tick(50); // 0 -> 50
        test.ok(!success);

        clock.tick(50); // 50 -> 100
        test.ok(success);

        clock.tick(50); // 100 -> 150
        success();

        clock.tick(50); // 150 -> 200
        test.ok(success);

        clock.tick(150); // 200 -> 350
        success();

        clock.tick(40); // 350 -> 390
        test.ok(!success);

        clock.tick(10); // 390 -> 400
        test.ok(success);

        test.done();
    }
};

