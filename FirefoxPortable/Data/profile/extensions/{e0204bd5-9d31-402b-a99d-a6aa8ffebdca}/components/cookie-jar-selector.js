// Bug 1506 P1: This component is currently only used to protect
// user-selected cookies from deletion. Moreover, all the E4X code is
// deprecated and needs to be replaced with JSON.

/*************************************************************************
 * Cookie Jar Selector (JavaScript XPCOM component)
 * Enables selection of separate cookie jars for (more) anonymous browsing.
 * Designed as a component of FoxTor, http://cups.cs.cmu.edu/foxtor/
 * Copyright 2006, distributed under the same (open source) license as FoxTor
 *
 * Contributor(s):
 *         Collin Jackson <mozilla@collinjackson.com>
 *
 *************************************************************************/

// Module specific constants
const kMODULE_NAME = "Cookie Jar Selector";
const kMODULE_CONTRACTID = "@torproject.org/cookie-jar-selector;1";
const kMODULE_CID = Components.ID("e6204253-b690-4159-bfe8-d4eedab6b3be");

const Cr = Components.results;

function CookieJarSelector() {
  var Cc = Components.classes;
  var Ci = Components.interfaces;

  this.logger = Components.classes["@torproject.org/torbutton-logger;1"]
      .getService(Components.interfaces.nsISupports).wrappedJSObject;

  this.logger.log(3, "Component Load 5: New CookieJarSelector "+kMODULE_CONTRACTID);

  this.prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);

  var getProfileFile = function(filename) {
    var loc = "ProfD";  // profile directory
    var file = 
      Cc["@mozilla.org/file/directory_service;1"]
      .getService(Ci.nsIProperties)
      .get(loc, Ci.nsILocalFile)
      .clone();
    file.append(filename); 
    return file;
  };

  var copyProfileFile = function(src, dest) {
    var srcfile = getProfileFile(src);    
    var destfile = getProfileFile(dest);
    if (srcfile.exists()) {
      // XXX: Permissions issue with Vista roaming profiles? 
      // Maybe file locking?
      try {
          if (destfile.exists()) {
              destfile.remove(false);
          }
      } catch(e) {
          this.logger.log(4, "Cookie file deletion exception: "+e);
      }
      try {
          srcfile.copyTo(null, dest);
      } catch(e) {
          this.logger.log(5, "Cookie file copy exception: "+e);
      }
    }
  };

  var moveProfileFile = function(src, dest) { // FIXME: Why does this not work?
    var srcfile = getProfileFile(src);    
    var destfile = getProfileFile(dest);
    if (srcfile.exists()) {
      if (destfile.exists()) {
        destfile.remove(false);
      }
      srcfile.moveTo(null, dest);
    }
  };

  this.clearCookies = function() {
    try {
        Cc["@mozilla.org/cookiemanager;1"]
            .getService(Ci.nsICookieManager)
            .removeAll();
    } catch(e) {
        this.logger.log(4, "Cookie clearing exception: "+e);
    }
  };

  // json would be a fine alternative to e4x, but is only available from
  // gecko1.9
  //
  // see http://developer.mozilla.org/en/docs/Core_JavaScript_1.5_Guide:Processing_XML_with_E4X
  // and http://developer.mozilla.org/en/docs/E4X
  // for information about e4x
  this._cookiesToXml = function(getSession) {
    var cookieManager =
      Cc["@mozilla.org/cookiemanager;1"]
      .getService(Ci.nsICookieManager);
    var cookiesEnum = cookieManager.enumerator;
    var cookiesAsXml = new XML('<cookies/>');
    while (cookiesEnum.hasMoreElements()) {
        var cookie = cookiesEnum.getNext().QueryInterface(Ci.nsICookie2);
        var xml = <cookie>{cookie.value}</cookie>;
        //this.logger.log(2, "Saving cookie: "+cookie.host+":"+cookie.name+" until: "+cookie.expiry);
        xml.@name = cookie.name;
        xml.@host = cookie.host;
        xml.@path = cookie.path;
        if (cookie.isSecure)
            xml.@isSecure = 1;
        if (cookie.isSession) {
            xml.@isSession = 1;
            // session cookies get fucked up expiry. Give it 1yr if
            // the user wants to save their session cookies
            xml.@expiry = Date.now()/1000 + 365*24*60*60;
        } else {
            xml.@expiry = cookie.expiry; 
        }
        if (cookie.isHttpOnly)
            xml.@isHttpOnly = 1;

        // Save either session or non-session cookies this time around:
        if (cookie.isSession && getSession ||
                !cookie.isSession && !getSession)
            cookiesAsXml.appendChild(xml);
    }
    return cookiesAsXml;
  };

  this._loadCookiesFromXml = function(cookiesAsXml) {
        if (typeof(cookiesAsXml) == "undefined" || !cookiesAsXml)
            return;

        var cookieManager =
            Cc["@mozilla.org/cookiemanager;1"]
            .getService(Ci.nsICookieManager2);

        for (var i = 0; i < cookiesAsXml.cookie.length(); i++) {
            var xml = cookiesAsXml.cookie[i];
            var value = xml.toString();
            var cname = xml.@name; 
            var host = xml.@host;
            var path = xml.@path;
            var expiry = xml.@expiry;
            var isSecure = (xml.@isSecure == 1);
            var isSession = (xml.@isSession == 1);
            var isHttpOnly = (xml.@isHttpOnly == 1);
            //this.logger.log(2, "Loading cookie: "+host+":"+cname+" until: "+expiry);
            cookieManager.add(host, path, cname, value, isSecure,
                    isHttpOnly, isSession, expiry);
        }
  };

  this._cookiesToFile = function(name) {
    var file = getProfileFile("cookies-" + name + ".xml");
    var foStream = Cc["@mozilla.org/network/file-output-stream;1"]
          .createInstance(Ci.nsIFileOutputStream);
    foStream.init(file, 0x02 | 0x08 | 0x20, 0666, 0);
    var data = this["cookiesobj-" + name].toString();
    foStream.write(data, data.length);
    foStream.close();
  };

  // Start1506
  this._protectedCookiesToFile = function(name) {
    var file = getProfileFile("protected-" + name + ".xml");
    var foStream = Cc["@mozilla.org/network/file-output-stream;1"]
        .createInstance(Ci.nsIFileOutputStream);
    foStream.init(file, 0x02 | 0x08 | 0x20, 0666, 0);
    var data = this["protected-" + name].toString();
    foStream.write(data, data.length);
    foStream.close();
  };

  this.addProtectedCookie = function(cookie) {
    var tor_enabled = this.prefs.getBoolPref("extensions.torbutton.tor_enabled");
    var name = tor_enabled? "tor" : "nontor";
    var cookies = this.getProtectedCookies(name);

    if (typeof(cookies) == "undefined" || cookies == null
            || cookies.toString() == "")
      cookies = new XML('<cookies/>');
    var xml = <cookie>{cookie.value}</cookie>;
    xml.@name = cookie.name;
    xml.@host = cookie.host;
    xml.@path = cookie.path;
    if (cookie.isSecure)
      xml.@isSecure = 1;
    if (cookie.isSession) {
      xml.@isSession = 1;
      // session cookies get fucked up expiry. Give it 1yr if
      // the user wants to save their session cookies
      xml.@expiry = Date.now()/1000 + 365*24*60*60;
    } else {
      xml.@expiry = cookie.expiry; 
    }
    if (cookie.isHttpOnly)
      xml.@isHttpOnly = 1;

    cookies.appendChild(xml);
    this["protected-" + name] = cookies;

    if (!this.prefs.getBoolPref("extensions.torbutton." + name + "_memory_jar")) {
      // save protected cookies to file
      this._protectedCookiesToFile(name);
    } else {
      try {
        var file = getProfileFile("protected-" + name + ".xml");
        if (file.exists()) {
          file.remove(false);
        }
      } catch(e) {
        this.logger.log(5, "Can't remove "+name+" cookie file: "+e);
      }
    }
  };

  this.getProtectedCookies = function(name) {
      var file = getProfileFile("protected-" + name + ".xml");
      if (!file.exists()) {
        return this["protected-" + name];
      }
      var data = "";
      var fstream = Cc["@mozilla.org/network/file-input-stream;1"]
          .createInstance(Ci.nsIFileInputStream);
      var sstream = Cc["@mozilla.org/scriptableinputstream;1"]
          .createInstance(Ci.nsIScriptableInputStream);
      fstream.init(file, -1, 0, 0);
      sstream.init(fstream); 

      var str = sstream.read(4096);
      while (str.length > 0) {
          data += str;
          str = sstream.read(4096);
      }

      sstream.close();
      fstream.close();
      try {
          var ret = XML(data);
      } catch(e) { // file has been corrupted; XXX: handle error differently
          this.logger.log(5, "Cookies corrupted: "+e);
          try {
              file.remove(false); //XXX: is it necessary to remove it ?
              var ret = null;
          } catch(e2) {
              this.logger.log(5, "Can't remove file "+e);
          }
      }
      return ret;
  };

  this.protectCookies = function(cookies) {
    var tor_enabled = this.prefs.getBoolPref("extensions.torbutton.tor_enabled");
    var name = tor_enabled? "tor" : "nontor";
    this._writeProtectCookies(cookies,name);
    if (!this.prefs.getBoolPref("extensions.torbutton." + name + "_memory_jar")) {
      // save protected cookies to file
      this._protectedCookiesToFile(name);
    } else {
      try {
        var file = getProfileFile("protected-" + name + ".xml");
        if (file.exists()) {
          file.remove(false);
        }
      } catch(e) {
        this.logger.log(5, "Can't remove "+name+" cookie file: "+e);
      }
    }
  };

  this._writeProtectCookies = function(cookies, name) {
    var cookieManager =
      Cc["@mozilla.org/cookiemanager;1"]
      .getService(Ci.nsICookieManager);
    var cookiesEnum = cookieManager.enumerator;
    var cookiesAsXml = new XML('<cookies/>');
    for (var i = 0; i < cookies.length; i++) {
        var cookie = cookies[i];
        var xml = <cookie>{cookie.value}</cookie>;
        //this.logger.log(2, "Saving cookie: "+cookie.host+":"+cookie.name+" until: "+cookie.expiry);
        xml.@name = cookie.name;
        xml.@host = cookie.host;
        xml.@path = cookie.path;
        if (cookie.isSecure)
            xml.@isSecure = 1;
        if (cookie.isSession) {
            xml.@isSession = 1;
            // session cookies get fucked up expiry. Give it 1yr if
            // the user wants to save their session cookies
            xml.@expiry = Date.now()/1000 + 365*24*60*60;
        } else {
            xml.@expiry = cookie.expires; 
        }
        if (cookie.isHttpOnly)
            xml.@isHttpOnly = 1;

        // Save either session or non-session cookies this time around:
        cookiesAsXml.appendChild(xml);
    }
    this["protected-" + name] = cookiesAsXml;
  };
  // End1506

  this._cookiesFromFile = function(name) {
      var file = getProfileFile("cookies-" + name + ".xml");
      if (!file.exists())
          return null;
      var data = "";
      var fstream = Cc["@mozilla.org/network/file-input-stream;1"]
          .createInstance(Ci.nsIFileInputStream);
      var sstream = Cc["@mozilla.org/scriptableinputstream;1"]
          .createInstance(Ci.nsIScriptableInputStream);
      fstream.init(file, -1, 0, 0);
      sstream.init(fstream); 

      var str = sstream.read(4096);
      while (str.length > 0) {
          data += str;
          str = sstream.read(4096);
      }

      sstream.close();
      fstream.close();
      try {
          var ret = XML(data);
      } catch(e) { // file has been corrupted; XXX: handle error differently
          this.logger.log(5, "Cookies corrupted: "+e);
          try {
              file.remove(false); //XXX: is it necessary to remove it ?
              var ret = null;
          } catch(e2) {
              this.logger.log(5, "Can't remove file "+e);
          }
      }
      return ret;
  };

  this.saveCookies = function(name) {
    // transition removes old tor-style cookie file
    try {
        var oldCookieFile = getProfileFile("cookies-"+name+this.extn);
        if (oldCookieFile.exists()) {
            oldCookieFile.remove(false);
        }
    } catch(e) {
        this.logger.log(5, "Can't remove old "+name+" file "+e);
    }

    // save cookies to xml objects
    this["session-cookiesobj-" + name] = this._cookiesToXml(true);
    this["cookiesobj-" + name] = this._cookiesToXml(false);

    if (!this.prefs.getBoolPref("extensions.torbutton." + name + "_memory_jar")) {
        // save cookies to file
        this._cookiesToFile(name);
    } else {
        try {
            var file = getProfileFile("cookies-" + name + ".xml");
            if (file.exists()) {
                file.remove(false);
            }
        } catch(e) {
            this.logger.log(5, "Can't remove "+name+" cookie file "+e);
        }
    }

    // ok, everything's fine
    this.logger.log(2, "Cookies saved");
  };

  // Start1506
  this.clearUnprotectedCookies = function(name) {
    try {
      var cookiesAsXml = this.getProtectedCookies(name);
      if (cookiesAsXml == null || typeof(cookiesAsXml) == "undefined"
              || cookiesAsXml.toString() == "") {
        //file does not exist - no protected cookies. Clear them all.
        this.clearCookies();
        return;
      }
      var cookiemanager =
        Cc["@mozilla.org/cookiemanager;1"]
        .getService(Ci.nsICookieManager2);

      var enumerator = cookiemanager.enumerator;
      var count = 0;
      var protcookie = false;

      while (enumerator.hasMoreElements()) {
        var nextCookie = enumerator.getNext();
        if (!nextCookie) break;

        nextCookie = nextCookie.QueryInterface(Components.interfaces.nsICookie);
        for (var i = 0; i < cookiesAsXml.cookie.length(); i++) {
          var xml = cookiesAsXml.cookie[i];
          var cvalue = xml.toString();
          var cname = xml.@name;
          var chost = xml.@host;
          var cpath = xml.@path;

          protcookie = protcookie || (nextCookie.host == chost && nextCookie.name == cname && nextCookie.path == cpath);
        }

        if (!protcookie) {
          cookiemanager.remove(nextCookie.host,
                             nextCookie.name,
                             nextCookie.path, false);
        }
        protcookie = false;
      }
      // Emit cookie-changed event. This instructs other components to clear their identifiers
      // (Specifically DOM storage and safe browsing, but possibly others)
      var obsSvc = Components.classes["@mozilla.org/observer-service;1"].getService(nsIObserverService);
      obsSvc.notifyObservers(this, "cookie-changed", "cleared");
    } catch (e) {
      this.logger.log(3, "Error deleting unprotected cookies: " + e);
    }
  };
  // End1506

  this._oldLoadCookies = function(name, deleteSavedCookieJar) {
    var cookieManager =
      Cc["@mozilla.org/cookiemanager;1"]
      .getService(Ci.nsICookieManager);
    cookieManager.QueryInterface(Ci.nsIObserver);

    // Tell the cookie manager to unload cookies from memory and disk
    var context = "shutdown-cleanse"; 
    cookieManager.observe(this, "profile-before-change", context);

    // Replace the cookies.txt file with the loaded data
    var fn = deleteSavedCookieJar ? moveProfileFile : copyProfileFile;
    fn("cookies-"+name+this.extn, "cookies"+this.extn);

    // Tell the cookie manager to reload cookies from disk
    cookieManager.observe(this, "profile-do-change", context);
    this.logger.log(2, "Cookies reloaded");
  };

  this.loadCookies = function(name, deleteSavedCookieJar) {
    // remove cookies before loading old ones
    this.clearCookies();

    /* transition code from old jars */
    if (!this.is_ff3) {
        try {
            var oldCookieFile = getProfileFile("cookies-"+name+this.extn);
            if (oldCookieFile.exists()) {
                this._oldLoadCookies(name, deleteSavedCookieJar);
                if (oldCookieFile.exists()) {
                    oldCookieFile.remove(false);
                }
            }
        } catch(e) {
            this.logger.log(5, "Can't remove old "+name+" file "+e);
        }
    }

    if (!this.prefs.getBoolPref("extensions.torbutton." + name + "_memory_jar")) {
        // load cookies from file
        this["cookiesobj-" + name] = this._cookiesFromFile(name);
    }

    //delete file if needed
    if (deleteSavedCookieJar) { 
        try {
            var file = getProfileFile("cookies-" + name + ".xml");
            if (file.exists())
                file.remove(false);
        } catch(e) {
            this.logger.log(5, "Can't remove saved "+name+" file "+e);
        }
    }

    // load cookies from xml objects
    this._loadCookiesFromXml(this["cookiesobj-"+name]);
    this._loadCookiesFromXml(this["session-cookiesobj-"+name]);

    // XXX: send a profile-do-change event?

    // ok, everything's fine
    this.logger.log(2, "Cookies reloaded");
  };

  // Check firefox version to know filename
  var appInfo = Components.classes["@mozilla.org/xre/app-info;1"]
      .getService(Components.interfaces.nsIXULAppInfo);
  var versionChecker = Components.classes["@mozilla.org/xpcom/version-comparator;1"]
      .getService(Components.interfaces.nsIVersionComparator);

  if(versionChecker.compare(appInfo.version, "3.0a1") >= 0) {
      this.is_ff3 = true;
      this.extn = ".sqlite";
  } else {
      this.is_ff3 = false;
      this.extn = ".txt";
  }

  // This JSObject is exported directly to chrome
  this.wrappedJSObject = this;

  // This timer is done so that in the event of a crash, we at least
  // have recent cookies in a jar to reload from.
  var jarThis = this;
  this.timerCallback = {
    cookie_changed: false,

    QueryInterface: function(iid) {
       if (!iid.equals(Component.interfaces.nsISupports) &&
           !iid.equals(Component.interfaces.nsITimer)) {
         Components.returnCode = Cr.NS_ERROR_NO_INTERFACE;
         return null;
       }
       return this;
    },
    notify: function() {
       // this refers to timerCallback object. use jarThis to reference
       // CookieJarSelector object.
       if(!this.cookie_changed) {
           jarThis.logger.log(2, "Got timer update, but no cookie change.");
           return;
       }
       jarThis.logger.log(3, "Got timer update. Saving changed cookies to jar.");
       var tor_enabled = 
           jarThis.prefs.getBoolPref("extensions.torbutton.tor_enabled");

       if(tor_enabled !=
           jarThis.prefs.getBoolPref("extensions.torbutton.settings_applied")) {
           jarThis.logger.log(3, "Neat. Timer fired during transition.");
           return;
       }

       this.cookie_changed = false;

       if(tor_enabled) {
           jarThis.saveCookies("tor");
       } else {
           jarThis.saveCookies("nontor");
       }
       jarThis.logger.log(2, "Timer done. Cookies saved");
    }
  };

}

const nsISupports = Components.interfaces.nsISupports;
const nsIClassInfo = Components.interfaces.nsIClassInfo;
const nsIObserver = Components.interfaces.nsIObserver;
const nsITimer = Components.interfaces.nsITimer;
const nsIComponentRegistrar = Components.interfaces.nsIComponentRegistrar;
const nsIObserverService = Components.interfaces.nsIObserverService;
const nsICategoryManager = Components.interfaces.nsICategoryManager;

// Start1506: You may or may not care about this:
CookieJarSelector.prototype =
{
  QueryInterface: function(iid)
  {
    if (!iid.equals(nsIClassInfo) &&
        !iid.equals(nsIObserver) &&
        !iid.equals(nsISupports)) {
      Components.returnCode = Cr.NS_ERROR_NO_INTERFACE;
      return null;
    }
    return this;
  },

  wrappedJSObject: null,  // Initialized by constructor

  // make this an nsIClassInfo object
  flags: nsIClassInfo.DOM_OBJECT,

  _xpcom_categories: [{category:"profile-after-change"}],
  classID: kMODULE_CID,
  contractID: kMODULE_CONTRACTID,
  classDescription: "CookieJarSelector",

  // method of nsIClassInfo
  getInterfaces: function(count) {
    var interfaceList = [nsIClassInfo];
    count.value = interfaceList.length;
    return interfaceList;
  },

  // method of nsIClassInfo
  getHelperForLanguage: function(count) { return null; },

  // method of nsIObserver
  observe : function(aSubject, aTopic, aData) {
       switch(aTopic) { 
        case "cookie-changed":
            var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);          
            this.timerCallback.cookie_changed = true;
    
            if (aData == "added" && prefs.getBoolPref("extensions.torbutton.cookie_auto_protect") && ((!prefs.getBoolPref("extensions.torbutton.tor_memory_jar") && prefs.getBoolPref("extensions.torbutton.tor_enabled")) || (!prefs.getBoolPref("extensions.torbutton.nontor_memory_jar") && !prefs.getBoolPref("extensions.torbutton.tor_enabled"))))
            {
              this.addProtectedCookie(aSubject.QueryInterface(Components.interfaces.nsICookie2));//protect the new cookie!    
            }
            break;
        case "profile-after-change":
            var obsSvc = Components.classes["@mozilla.org/observer-service;1"].getService(nsIObserverService);
            obsSvc.addObserver(this, "cookie-changed", false);
            // after profil loading, initialize a timer to call timerCallback
            // at a specified interval
            this.timer.initWithCallback(this.timerCallback, 60 * 1000, nsITimer.TYPE_REPEATING_SLACK); // 1 minute
            this.logger.log(3, "Cookie jar selector got profile-after-change");
            break;
       }
  },

  timer:  Components.classes["@mozilla.org/timer;1"].createInstance(nsITimer),

}

/**
* XPCOMUtils.generateNSGetFactory was introduced in Mozilla 2 (Firefox 4).
* XPCOMUtils.generateNSGetModule is for Mozilla 1.9.2 (Firefox 3.6).
*/
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
if (XPCOMUtils.generateNSGetFactory)
    var NSGetFactory = XPCOMUtils.generateNSGetFactory([CookieJarSelector]);
else
    var NSGetModule = XPCOMUtils.generateNSGetModule([CookieJarSelector]);

// End1506
