exports.context = { 
    name: "John Dow",
    year: function(context) {
        return function(context, callback) {
            setTimeout(function() {
                callback(undefined, context.value);
            }, 200);
        };
    },
    value: 1968,
    tag: "<tag>"
};

exports.options = {
        
};