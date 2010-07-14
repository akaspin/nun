exports.context = {
    header: function(context) {
        return function(context, callback) {
            process.nextTick(function() {
                callback(undefined, "Colors");
            });
        };
      },
      
      
      item: [
             {name: "red", current: true, url: "#Red"},
             {name: "green", current: false, url: "#Green"},
             {name: "blue", current: false, url: "#Blue"}
             ],
    link: function(context) {
        return context["current"] !== true;
      },
      list: function(context) {
          return context.item.length !== 0;
      },
      empty: function(context) {
          return context.item.length === 0;
      }
};

exports.options = {};