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

/**
 * Collect
 * @param root Root folder
 * @param targets targets
 */
function collect(root, targets, prefix, ext) {
    var pattern = new RegExp("^" + prefix + ".+" + 
            ext.replace(/\./, "\\\.") + "$");
    var targets = targets.reduce(function(acc, t) {
        return acc.concat(path.normalize(root + "/" + t));
    }, []);
    return targets.reduce(function(acc, dir) {
        try {
            return acc.concat(
                    fs.readdirSync(dir).reduce(function(acc, file) {
                        var fullName = path.normalize(dir + "/" + file);
                        var ok = pattern.exec(file) && 
                        fs.statSync(fullName).isFile();
                        return ok ? acc.concat(fullName) : acc;
                    }, [])
            );
        } catch (e) {
            console.warn("WARN: %s\n%s", e.message, e.stack);
            return acc;
        }
    } ,[]);
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
function Runner(targets, conc, host) {
    events.EventEmitter.call(this);
    this.conc = conc || 1;
    this.host = host || "node";
    this.pending = targets;
    this.running = 0;
    this.start = Date.now();
}
util.inherits(Runner, events.EventEmitter);

Runner.prototype.run = function() {
    if (this.pending.length) {
        var forLaunch = this.conc > this.pending.length ?
                this.pending.length : this.conc;
        
        for (var i = 0; i < forLaunch; i++) {
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
     var file = this.pending.shift();
     var test = {
             file: file,
             time: Date.now()
     };
     var self = this;
     exec(this.host + " " + file, function(error, stdout, stderr) {
         test.time = (Date.now() - test.time) / 1000 ;
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
  * Reporter. Catches Runner events and prints the report 
  * in accordance given with options.
  * 
  * @param runner Runner
  * @param opts Options
  * @returns {Reporter}
  */
 function Reporter(runner, opts) {
     this.runner = runner;
     this.opts = opts;
     
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
         return "* " + pre + "\n    " +  out
         .replace(/\n$/, "")
         .replace(/^\n/, "")
         .replace(/\n\n/, "\n")
         .replace(/\n/g, "\n    ");
         
     }
     
     this.total++;
     if (test.fail != null) {
         // Oops. Test failed
         var mark = "FAIL";
         var need = (!this.opts.get("noout") && test.out) 
         || !this.opts.get("noerr") 
         || !this.opts.get("nofailed");
         var outer = console.error;
     } else {
         this.passed++;
         var mark = "PASS";
         var need = (!this.opts.get("noout") && test.out)
         || this.opts.get("passed");
         var outer = console.log;
     }
     
     if (need) {
         var name = path.basename(test.file, this.opts.get("ext"))
         .substring(this.opts.get("prefix").length);
         var time = this.opts.get("times") ? " (" + test.time +"s)" : "";
         
         if (!this.anyWritten) {
             console.log();
             this.anyWritten = true;
         }
         
         outer("%s %s%s", mark, name, time);
         if (test.out && !this.opts.get("noout")) {
             outer(formatOut("output", test.out));
         }
         if (test.err && !this.opts.get("noerr")) {
             outer(formatOut("errors", test.err));
         }
     }
 };
 Reporter.prototype.done = function(time) {
     var time = this.opts.get("times") ? " (" + time +"s)" : "";
     var anyWritten = this.anyWritten ? "\n" : "";
     var outer = this.passed == this.total ?
             console.log : console.error;
     
     outer("%s%d/%d%s%s", anyWritten, 
             this.passed, this.total, time, anyWritten);
 };
 
 /**
  * Command-line options parser. Quick and dirty.
  * @param synopsis
  * @returns {Opts}
  */
 function Opts(synopsis) {
     this._synopsis = synopsis;
     this._opts = {};
     this._params = [""];
 }
 Opts.prototype.set = function(name, value, message) {
     this._opts[name] = {
             value: value, 
             message: message};
     return this;
 };
 Opts.prototype.parse = function(args) {
     var self = this;
     args.forEach(function(arg) {
         if (arg.substring(0,2) === "--") {
             // it's option
             var tokens = arg.split("=");
             var name = tokens[0].substring(2);
             var value = tokens.length == 1 ? true : tokens[1];
             
             if (self._opts[name]) {
                 self._opts[name].value = value;
             }
         } else {
             // it's param
             self._params.push(arg);
         }
     });
     return this;
 };
 Opts.prototype.get = function(name) {
     return this._opts[name].value;
 };
 Opts.prototype.__defineGetter__("params", function() {
     return this._params;
 });
 Opts.prototype.__defineGetter__("usage", function() {
     function trail(str, max) {
         for (var i = 0, t = "  "; i < max - str.length; i++) {
             t += " ";
         }
         return str + t;
     }
     var usage = this._synopsis + "\n\n";
     var maxlength = Object.keys(this._opts).reduce(function(max, name) {
         return name.length > max ? name.length : max;
     }, 0);
     for (var k in this._opts) {
         usage += "  --" + trail(k, maxlength) + this._opts[k].message + "\n";
     }
     return usage;
     
 });

 if (!module.parent) {
    // if we are in running module
    var opts = new Opts(
            "Pit, Simple drop-in test runner.\n" +
            "http://github.com/akaspin/pit\n\n" +
            "usage: node run.js [options] [targets]")
            .set("prefix", "test-", "Prefix for collect tests.")
            .set("ext", ".js", "Extension for collect tests.")
            .set("times", false, "Show tests durations.")
            .set("passed", false, "Show passed tests.")
            .set("nofailed", false, "Disable failed tests.")
            .set("noout", false, "Disable tests STDOUT.")
            .set("noerr", false, "Disable tests STDERR.")
            .set("conc", "1", "Concurrent tests.")
            .set("host", "node", "Host interpreter.")
            .set("help", false, "Help. This message.")
        .parse(process.argv.slice(2));
    
    if (opts.get("help")) {
        console.log(opts.usage);
    } else {
        // run tests
        var tests = collect(process.cwd(), opts.params, 
                opts.get("prefix"), opts.get("ext"));
        var runner = new Runner(tests, parseInt(opts.get("conc")));
        new Reporter(runner, opts);
    }
}