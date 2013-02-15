// Bug 1506 P1: We're almost certainly going to replace this stuff with direct
// patches of the JS VM. 

window.__HookObjects = function() {
  if (typeof(window.__tb_hooks_ran) === "boolean") {
      return false;
  }

  // No pref for this.. Should be mostly harmless..
  if(true) {
      // Wrap in anonymous function to protect scr variables just in case.
      (function () {
          var origHeight = window.innerHeight;
          var origWidth = window.innerWidth;

          Object.defineProperty(window.__proto__, "innerWidth",
                          {get: function() { return Math.round(origWidth/50.0)*50;},
                          configurable: false});
          Object.defineProperty(window.__proto__, "innerHeight",
                          {get: function() { return Math.round(origHeight/50.0)*50;},
                          configurable: false});
          Object.defineProperty(window.__proto__, "outerWidth",
                          {get: function() { return Math.round(origWidth/50.0)*50;},
                          configurable: false});
          Object.defineProperty(window.__proto__, "outerHeight",
                          {get: function() { return Math.round(origHeight/50.0)*50;},
                          configurable: false});
          Object.defineProperty(window.__proto__, "screenX",
                          {get: function() { return 0;},
                          configurable: false});
          Object.defineProperty(window.__proto__, "screenY",
                          {get: function() { return 0;},
                          configurable: false});
          Object.defineProperty(MouseEvent.prototype, "screenX",
                          {get: function() { return this.clientX;},
                          configurable: false});
          Object.defineProperty(MouseEvent.prototype, "screenY",
                          {get: function() { return this.clientY;},
                          configurable: false});

          // We can't define individual getters/setters for window.screen 
          // for some reason. works in html but not in these hooks.. No idea why

          var scr = new Object();
          var origScr = window.screen;
          scr.__defineGetter__("height", function() { return window.innerHeight; });
          scr.__defineGetter__("width", function() { return window.innerWidth; });

          scr.__defineGetter__("availTop", function() { return 0;});
          scr.__defineGetter__("availLeft", function() { return 0;});

          scr.__defineGetter__("top", function() { return 0;});
          scr.__defineGetter__("left", function() { return 0;});

          scr.__defineGetter__("availHeight", function() { return window.innerHeight;});
          scr.__defineGetter__("availWidth", function() { return window.innerWidth;});

          scr.__defineGetter__("colorDepth", function() { return origScr.colorDepth;});
          scr.__defineGetter__("pixelDepth", function() { return origScr.pixelDepth;});

          scr.__defineGetter__("availTop", function() { return 0;});
          scr.__defineGetter__("availLeft", function() { return 0;});

          Object.defineProperty(window.__proto__, "screen",
                      {get: function() { return scr;},
                      configurable: false});

      })();

  }

  if(window.__tb_hook_date == true) { // don't feel like indenting this
  // XXX: events should not have timeStamp, unless they are of type MozBeforePaint?

  /* Timezone fix for http://gemal.dk/browserspy/css.html */
  var reparseDate = function(d, str) {
    /* Rules:
     *   - If they specify a timezone, it is converted to local
     *     time. All getter fucntions then convert properly to
     *     UTC. No mod needed.
     *   - If they specify UTC timezone, then it is converted
     *     to local time. All getter functions then convert back.
     *     No mod needed.
     *   - If they specify NO timezone, it is local time. 
     *     The UTC conversion then reveals the offset. Fix.
     */
    
    /* Step 1: Remove everything inside ()'s (they are "comments") */
    var s = str.toLowerCase();
    var re = new RegExp('\\(.*\\)', "gm");
    s = s.replace(re, "");

    /* Step 2: Look for +/-. If found, do nothing */
    if(s.indexOf("+") == -1 && s.indexOf("-") == -1) {
      /* Step 3: Look for timezone string from
       * http://lxr.mozilla.org/seamonkey/source/js/src/jsdate.c
       */
      if(s.indexOf(" gmt") == -1 && s.indexOf(" ut") == -1 &&
         s.indexOf(" est") == -1 && s.indexOf(" edt") == -1 &&
         s.indexOf(" cst") == -1 && s.indexOf(" cdt") == -1 &&
         s.indexOf(" mst") == -1 && s.indexOf(" mdt") == -1 &&
         s.indexOf(" pst") == -1 && s.indexOf(" pdt")) {
        /* No timezone specified. Adjust. */
        d.setTime(d.getTime()-(d.getTimezoneOffset()*60000));
      }
    } 
  } 
 
  // XXX: Each origin should have its own unique offset from the real date
  // XXX: Subsequent calls to the ms timer should be monotonically increasing, but randomized

  var origDate = window.Date;
  var newDate = function() {
    /* DO NOT make 'd' a member! EvilCode will use it! */
    var d;
    var a = arguments;
    /* apply doesn't seem to work for constructors :( */
    if(arguments.length == 0) d=new origDate();
    if(arguments.length == 1) d=new origDate(a[0]);
    if(arguments.length == 3) d=new origDate(a[0],a[1],a[2]);
    if(arguments.length == 4) d=new origDate(a[0],a[1],a[2],a[3]);
    if(arguments.length == 5) d=new origDate(a[0],a[1],a[2],a[3],a[4]);
    if(arguments.length == 6) d=new origDate(a[0],a[1],a[2],a[3],a[4],a[5]);
    if(arguments.length == 7) d=new origDate(a[0],a[1],a[2],a[3],a[4],a[5],a[6]);
    if(arguments.length > 7) d=new origDate();

    if(arguments.length > 0) {
      if((arguments.length == 1) && typeof(a[0]) == "string") {
        reparseDate(d,a[0]);
      } else if(arguments.length > 1) { 
        /* Numerical value. No timezone given, adjust. */
        d.setTime(d.getTime()-(d.getTimezoneOffset()*60000));
      }
    }

    // XXX: the native valueOf seems to sometimes return toString and 
    // sometimes return getTime depending on context (which we can't detect)
    // It seems as though we can't win here..
    window.Date.prototype.valueOf=function(){return d.getTime()};
    window.Date.prototype.getTime=function(){return d.getTime();} /* UTC already */ 
    window.Date.prototype.getFullYear=function(){return d.getUTCFullYear();}  
    window.Date.prototype.getYear=function() {return d.getYear();}
    window.Date.prototype.getMonth=function(){return d.getUTCMonth();}
    window.Date.prototype.getDate=function() {return d.getUTCDate();}
    window.Date.prototype.getDay=function() {return d.getUTCDay();}
    window.Date.prototype.getHours=function(){return d.getUTCHours();}
    window.Date.prototype.getMinutes=function(){return d.getUTCMinutes();}
    window.Date.prototype.getSeconds=function(){return d.getUTCSeconds();}
    window.Date.prototype.getMilliseconds=function(){return d.getUTCMilliseconds();}
    window.Date.prototype.getTimezoneOffset=function(){return 0;}
 
    window.Date.prototype.setTime = 
       function(x) {return d.setTime(x);}
    window.Date.prototype.setFullYear=function(x){return d.setUTCFullYear(x);}
    window.Date.prototype.setYear=function(x){return d.setYear(x);}
    window.Date.prototype.setMonth=function(x){return d.setUTCMonth(x);}
    window.Date.prototype.setDate=function(x){return d.setUTCDate(x);}
    window.Date.prototype.setDay=function(x){return d.setUTCDay(x);}
    window.Date.prototype.setHours=function(x){return d.setUTCHours(x);}
    window.Date.prototype.setMinutes=function(x){return d.setUTCMinutes(x);}
    window.Date.prototype.setSeconds=function(x){return d.setUTCSeconds(x);}
    window.Date.prototype.setMilliseconds=
       function(x) {return d.setUTCMilliseconds(x);}
 
    window.Date.prototype.getUTCFullYear=function(){return d.getUTCFullYear();}  
    window.Date.prototype.getUTCMonth=function(){return d.getUTCMonth();}
    window.Date.prototype.getUTCDate=function() {return d.getUTCDate();}
    window.Date.prototype.getUTCDay=function() {return d.getUTCDay();}
    window.Date.prototype.getUTCHours=function(){return d.getUTCHours();}
    window.Date.prototype.getUTCMinutes=function(){return d.getUTCMinutes();}
    window.Date.prototype.getUTCSeconds=function(){return d.getUTCSeconds();}
    window.Date.prototype.getUTCMilliseconds=
       function(){return d.getUTCMilliseconds();}
     
    window.Date.prototype.setUTCFullYear=function(x){return d.setUTCFullYear(x);}
    window.Date.prototype.setUTCMonth=function(x){return d.setUTCMonth(x);}
    window.Date.prototype.setUTCDate=function(x){return d.setUTCDate(x);}
    window.Date.prototype.setUTCDay=function(x){return d.setUTCDay(x);}
    window.Date.prototype.setUTCHours=function(x){return d.setUTCHours(x);}
    window.Date.prototype.setUTCMinutes=function(x){return d.setUTCMinutes(x);}
    window.Date.prototype.setUTCSeconds=function(x){return d.setUTCSeconds(x);}
    window.Date.prototype.setUTCMilliseconds=
        function(x) {return d.setUTCMilliseconds(x);}
  
    window.Date.prototype.toUTCString=function(){return d.toUTCString();}
    window.Date.prototype.toGMTString=function(){return d.toGMTString();}
    window.Date.prototype.toString=function(){return d.toUTCString();}
    window.Date.prototype.toLocaleString=function(){return d.toUTCString();}
    
    /* Fuck 'em if they can't take a joke: */
    window.Date.prototype.toLocaleTimeString=function(){return d.toUTCString();}
    window.Date.prototype.toLocaleDateString=function(){return d.toUTCString();}
    window.Date.prototype.toDateString=function(){return d.toUTCString();}
    window.Date.prototype.toTimeString=function(){return d.toUTCString();}
    
    /* Hack to solve the problem of multiple date objects
     * all sharing the same lexically scoped d every time a new one is
     * created. This hack creates a fresh new prototype reference for 
     * the next object to use with a different d binding.
     * It doesn't break stuff because at the start of this function, 
     * the interpreter grabbed a reference to Date.prototype. During 
     * this function we modified Date.prototype to create the new methods
     * with the lexically scoped d reference.
     */

    // valueOf gets called for implicit string conversion??
    window.Date.prototype = window.eval(window.Object.prototype.toSource());
    return d.toUTCString();
  }

  // Need to do this madness so that we use the window's notion of Function
  // for the constructor. If this is not done, then changes to Function
  // and Object in the real window are not propogated to Date (for example,
  // to extend the Date class with extra functions via a generic inheritance 
  // framework added onto Object - this is done by livejournal and others)
  var newWrappedDate = window.eval("function() { return newDate(); }");

  newWrappedDate.parse=function(s) {
    var d = new origDate(s);
    if(typeof(s) == "string") reparseDate(d, s);
    return d.getTime();    
  }

  newWrappedDate.now=function(){return origDate.now();}
  newWrappedDate.UTC=function(){return origDate.apply(origDate, arguments); }

  // d = new Date();
  // d.__proto__ === Date.prototype
  // d.constructor === Date
  // d.__proto__ === d.constructor.prototype
  // Date.prototype.__proto__  ===  Date.prototype.constructor.prototype 
  // window.__proto__ === Window.prototypea

  Object.defineProperty(window.__proto__, "Date",
                      {get: function() { return newWrappedDate;},
                      configurable: false});

  } // window.__tb_hook_date == true

  //Object.defineProperty(window.Components.__proto__, "lookupMethod",
  //        {get: function() { return function (a,b) { return function() { return a[b]; }; };},
  //         configurable: false});

  return true;
}

if (typeof(window.__HookObjects) != "undefined") {
    var res = 23;

    if(!window.__HookObjects()) {
        res = 13;
    }

    window.__HookObjects = undefined;
    delete window['__HookObjects'];
    delete window['__CheckFlag'];
    delete window['__tb_set_uagent'];
    delete window['__tb_oscpu'];
    delete window['__tb_platform'];
    delete window['__tb_productSub'];

    window.__tb_hooks_ran = true;

    res; // Secret result code.
} else {
    42;
}
