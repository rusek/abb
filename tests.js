"use strict";

var abb = require("./abb");

function notCalled(test) {
    return function() {
        test.ok(false, "Should not be called");
    };
}

exports.testSuccess = function(test) {
    abb.success(12).pipe(function(result) {
        test.equal(result, 12);
        test.done();
    }, notCalled(test));
};

exports.testError = function(test) {
    var expectedErr = new Error;
    abb.error(expectedErr).pipe(notCalled(test), function(err) {
        test.strictEqual(err, expectedErr);
        test.done();
    });
};

exports.testPipeWithSuccessSuccess = function(test) {
    abb.success(12).pipe(function(result) {
        return result * 2;
    }).pipe(function(result) {
        test.equal(result, 24);
        test.done();
    }, notCalled(test));
}

exports.testPipeWithSuccessError = function(test) {
    var expectedErr = new Error;
    abb.success(12).pipe(function(result) {
        throw expectedErr;
    }).pipe(notCalled(test), function(err) {
        test.strictEqual(err, expectedErr);
        test.done();
    });
}

exports.testPipeWithErrorSuccess = function(test) {
    var err = new Error;
    abb.error(err).pipe(null, function(err) {
        return 10;
    }).pipe(function(result) {
        test.equal(result, 10);
        test.done();
    }, notCalled(test));
}

exports.testPipeWithErrorError = function(test) {
    var err1 = new Error, err2 = new Error;
    abb.error(err1).pipe(null, function(err) {
        return err2;
    }).pipe(notCalled(test), function(err) {
        test.equal(err, err2);
        test.done();
    });
}

exports.testBlockSuppressWithSuccess = function(test) {
    abb.success(12).suppress(100).pipe(function(result) {
        test.equal(result, 12);
        test.done();
    }, notCalled(test));
};

exports.testBlockSuppressWithError = function(test) {
    abb.error(new Error("error")).suppress(100).pipe(function(result) {
        test.equal(result, 100);
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

