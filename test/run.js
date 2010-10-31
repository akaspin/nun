/**
 * Simple and lightweigt drop-in test runner.
 */

var assert = require('assert');
var exec = require('child_process').exec;
var fs = require('fs');
var path = require('path');
var util = require('util');
var events = require('events');

// setted marks
var marks = {
    "common": 0
};
// expected marks
var expects = {
    "common": 0
};
var pitted = false;
var pitchain = [
        function(marks, expects) {
            var message = "Marks do not meet expectations:";
            var bundle = {};
            // Filling with initial values
            for (var ek in expects) {
                bundle[ek] = {marks: undefined, expect: expects[ek]};
            }
            // extra keys from marks
            for (var mk in marks) {
                if (bundle[mk]) {
                    bundle[mk].marks = marks[mk];
                } else {
                    bundle[mk] = {marks: marks[mk], expect: undefined};
                }
            }
            for (var bk in bundle) {
                var satisfied = bundle[bk].marks === bundle[bk].expect ?
                        "+" : "-";
                message += "\n" + satisfied + " " + bk + ": " + 
                        bundle[bk].marks + "/" + bundle[bk].expect; 
            }
            assert.deepEqual(marks, expects, message);
        }
];

/**
 * Checks pitted and (if not) hook one to process.exit.
 */
function checkPitted() {
    if (!pitted) {
        process.on('exit', function() {
            pitchain.forEach(function(fn) {
                fn(marks, expects);
            });
        });
        pitted = true;
    }
}

/**
 * Sets one mark for label.
 * @param label Label for expect
 */
function mark(label) {
    checkPitted(); // check pit
    label = label || "common";
    if (!marks[label]) {
        marks[label] = 0;
    }
    marks[label]++;
}
exports.mark = mark;

/**
 * Sets one expect. Receives one or two arguments.
 * 
 *      expect(5);              // for common label
 *      expect("MyLabel", 5);   // for MyLabel  
 * 
 * @param label Label for expect
 * @param n Expected marks for label
 */
function expect(label, num) {
    checkPitted(); // check pit
    // Parse parameters
    if (!num) {
        // num is absent. Just set common
        // FIXME: convert label to int
        expects.common = label;
    } else {
        expects[label] = num;
    }
}
exports.expect = expect;

/**
 * Hooks up function to the top of pit.
 * @param fn Function that takes two arguments: markers and expects
 */
function hook(fn) {
    checkPitted(); // check pit
    pitchain.unshift(fn);
}
exports.hook = hook;

// Option parser
var opts = tav = { };
Object.defineProperty(tav, "args", {
 value : [],
 enumerable : false
});
Object.defineProperty(tav, "set", {
 value : function(spec, banner, strict) {
     var self = this;
     var incoming = process.argv.slice(2); // incoming params
     var arrayDiff = function(a, b) {
         return b.filter(function(i) {
             return a.indexOf(i) == -1;
         });
     };
     var check = function(parsed) {
         var end = false, message = "", code = 0, outer = console.log;
         var setted = Object.keys(self);
         var specced = Object.keys(parsed);
         var required = arrayDiff(setted, specced);
         var unexpected = arrayDiff(specced, setted);
         
         // If any required options is not provided - crash it!
         if (required.length) {
             end = true;
             code = 1;
             outer = console.error;
             message += "Required but not provided:\n    --" 
                     + required.join("\n    --") + "\n";
         }
         // + unexpected
         if (unexpected.length) {
             message += "Unexpected options:\n    --"
                     + unexpected.join("\n    --") + "\n";
         }
         if (strict && message.length) {
             end = true;
             code = 1;
             outer = console.error;
         }
         
         // If --help, exit without error
         if (incoming.indexOf("--help") != -1) {
             end = true;
             code = 0;
             outer = console.log;
         }
         
         if (end) {
             // exiting
             outer(banner + "\n");
             outer(message);
             outer(Object.keys(parsed).reduce(function(msg, k) {
                 return msg + parsed[k].note + "\n    --" + k
                        + (parsed[k].req ? " *required\n" : "\n");
             }, ""));
             process.exit(code);
         }
     };
     
     // Fill spec and default values
     var parsed = {};
     Object.keys(spec).forEach(function(name) {
         var req = spec[name].value === undefined ? true : false;
         var note = spec[name].note || "Note not provided";
         parsed[name] = {
             req : req,
             note : note
         };
         // If value not required - set it
         if (!req) {
             self[name] = spec[name].value;
         }
     });
     
     // Evaluate process.argv
     var numRe = /^[0-9.]+$/;
     incoming.filter(function(chunk) {
         return chunk != "--help" && chunk != "--";
     })
     .forEach(function(chunk) {
         if (chunk.substring(0,2) == "--") {
             var tokens = chunk.substring(2).split("=");
             var name = tokens[0];
             
             // Expected option - evaluate value
             if (tokens.length == 1) {
                 // Boolean
                 var value = true;
             } else {
                 var value = numRe.test(tokens[1]) ?
                         parseFloat(tokens[1]) : tokens[1]; 
             }
             self[name] = value;
         } else {
             // Just argument
             self.args.push(chunk);
         }
     });
     
     check(parsed);
     return this;
 },
 enumerable : false,
 configurable : false
});

/**
 * Collects tests from opts.args. Returns Array of
 * tests in following format:
 * 
 *     { file: '/absolute/test/filename', 
 *       group: 'test-group or empty' }
 */
function collect() {
    var pattern = new RegExp("^" + opts.prefix + ".+" + 
            opts.ext.replace(/\./, "\\\.") + "$");
    var groups = opts.args.concat('');
    
    return opts.args.concat('').reduce(function(tests, group) {
        var dir = path.normalize(opts.root + "/" + group);
        try {
            return fs.readdirSync(dir).reduce(function(tests, file) {
                var fullName = path.normalize(dir + "/" + file);
                var ok = pattern.exec(file) && fs.statSync(fullName).isFile();
                return ok ? tests.concat({
                    file : fullName,
                    group : group
                }) : tests;
            }, tests);
        } catch (e) {
            // some errors - just return tests
            console.warn("WARN: %s\n%s", e.message);
            return tests;
        }
    }, []);
}

/**
 * Test runner event emitter.
 * Runs tests. Emits next events:
 * 
 * * `data` - test done
 * * `end` - all tests runned
 * 
 * @param targets Array of file names
 * @param conc Number of concurrent processes
 */
function Runner(targets) {
    events.EventEmitter.call(this);
    this.pending = targets;
    this.running = 0;
    this.start = Date.now();
}
util.inherits(Runner, events.EventEmitter);

Runner.prototype.run = function() {
    if (this.pending.length) {
        var forLaunch = opts.conc > this.pending.length ? this.pending.length
                : opts.conc;

        for ( var i = 0; i < forLaunch; i++) {
            this.next();
        }
    } else {
        this.end();
    }
};

/**
 * Run next test
 */
Runner.prototype.next = function() {
    this.running++;
    var t = this.pending.shift();
    var test = {
        file : t.file,
        group : t.group,
        time : Date.now()
    };
    var self = this;
    exec(opts.host + " " + test.file, function(error, stdout, stderr) {
        test.time = (Date.now() - test.time) / 1000;
        test.fail = error;
        test.out = stdout ? stdout : undefined;
        test.err = stderr ? stderr : undefined;
        self.done(test);
    });
};
Runner.prototype.done = function(test) {
    this.running--;
    this.emit("data", test);
    if (this.pending.length) {
        this.next();
    } else if (this.running < 1) {
        this.end();
    }
};
Runner.prototype.end = function() {
    this.emit("end", (Date.now() - this.start) / 1000);
};

 /**
 * Reporter. Catches Runner events and prints the report in 
 * accordance given with options.
 * @param runner Runner
 * @returns {Reporter}
 */
function Reporter(runner) {
    this.runner = runner;
    this.total = 0;
    this.passed = 0;
    this.anyWritten = false;

    var self = this;
    this.runner.on("data", function(test) {
        self.test(test);
    });
    this.runner.on("end", function(time) {
        self.done(time);
    });
    this.runner.run();
}
Reporter.prototype.test = function(test) {
    // Just format output
    function formatOut(pre, out) {
        return "* " + pre + "\n    " + out
                .replace(/\n$/, "")
                .replace(/^\n/, "")
                .replace(/\n\n/, "\n")
                .replace(/\n/g, "\n    ");
    }

    this.total++;
    if (test.fail != null) {
        var mark = "FAIL";
        var need = (!opts.noout && test.out) || !opts.noerr || !opts.nofailed;
        var outer = console.error;
    } else {
        this.passed++;
        var mark = "PASS";
        var need = (!opts.noout && test.out) || opts.passed;
        var outer = console.log;
    }

    if (need) {
        var name = (test.group == '' ? '' : "[" + test.group + "] ") 
                + path.basename(test.file, opts.ext)
                        .substring( opts.prefix.length);
        var time = opts.times ? " (" + test.time + "s)" : "";

        if (!this.anyWritten) {
            console.log();
            this.anyWritten = true;
        }

        outer("%s %s%s", mark, name, time);
        if (test.out && !opts.noout) {
            outer(formatOut("output", test.out));
        }
        if (test.err && !opts.noerr) {
            outer(formatOut("errors", test.err));
        }
    }
};
Reporter.prototype.done = function(time) {
    var time = opts.times ? " (" + time + "s)" : "";
    var anyWritten = this.anyWritten ? "\n" : "";
    var outer = this.passed == this.total ? console.log : console.error;

    outer("%s%d/%d%s%s", anyWritten, this.passed, this.total, time, anyWritten);
};
 
 if (!module.parent) {
    // if we are in running module
     tav.set({
         prefix: {note: 'Prefix for collect tests.',
             value: 'test-'},
         ext: {note: 'Extension for collect tests.',
             value: '.js'},
         times: {note: 'Show tests durations.',
             value: false},
         passed: {note: 'Show passed tests.',
             value: false},
         nofailed: {note: 'Disable failed tests.',
             value: false},
         noout: {note: 'Disable tests STDOUT.',
             value: false},
         noerr: {note: 'Disable tests STDERR.',
             value: false},
         conc: {note: 'Concurrent threads.',
             value: 1},
         host: {note: 'Host interpreter.',
             value: "node"},
         root: {note: 'Root folder to collect tests.',
             value: __dirname}
     }, "Pit, Simple drop-in test runner.\n" +
     "http://github.com/akaspin/pit",
     true);
     
    // run tests
    var tests = collect();
    var runner = new Runner(tests);
    new Reporter(runner);
}