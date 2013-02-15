// Bug 1506 P4: This code blocks the session store from being written to
// disk. It is fairly important, but only one small piece is needed. Search
// this file for 1506 for more details.

/*************************************************************************
 * Torbutton Session Store Control
 *
 * Uses the new Firefox 3.5+ session store APIs to prevent writing
 * of tor-loaded tabs to disk.
 *
 *************************************************************************/

// Module specific constants
const kMODULE_NAME = "Torbutton Session Store Blocker";
const kMODULE_CONTRACTID = "@torproject.org/torbutton-ss-blocker;1";
const kMODULE_CID = Components.ID("aef08952-b003-4697-b935-a392367e214f");

const Cr = Components.results;
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

function TBSessionBlocker() {
    this.logger = Components.classes["@torproject.org/torbutton-logger;1"]
        .getService(Components.interfaces.nsISupports).wrappedJSObject;
    this.logger.log(3, "Torbutton Session Store Blocker initialized");

    var obsSvc = Components.classes["@mozilla.org/observer-service;1"]
        .getService(Ci.nsIObserverService);
    obsSvc.addObserver(this, "sessionstore-state-write", false);
    this.prefs = Components.classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefBranch);

    // Determine if we are firefox 4 or not.. The session store formats broke
    // in a backwards-incompatible way.
    var appInfo = Components.classes["@mozilla.org/xre/app-info;1"]
        .getService(Components.interfaces.nsIXULAppInfo);
    var versionChecker = Components.classes["@mozilla.org/xpcom/version-comparator;1"]
        .getService(Components.interfaces.nsIVersionComparator);

    if(versionChecker.compare(appInfo.version, "4.0a1") >= 0) {
        this.is_ff4 = true;
    } else {
        this.is_ff4 = false;
    }

    this.wrappedJSObject = this;
}

TBSessionBlocker.prototype =
{
  QueryInterface: function(iid) {
    if (!iid.equals(Ci.nsIClassInfo) &&
        !iid.equals(Ci.nsIObserver) &&
        !iid.equals(Ci.nsISupports)) {
      Components.returnCode = Cr.NS_ERROR_NO_INTERFACE;
      return null;
    }
    return this;
  },

  wrappedJSObject: null,  // Initialized by constructor

  // make this an nsIClassInfo object
  flags: Ci.nsIClassInfo.DOM_OBJECT,

  // method of nsIClassInfo
  classDescription: kMODULE_NAME,
  classID: kMODULE_CID,
  contractID: kMODULE_CONTRACTID,

  // Hack to get us registered early enough to observe the session store.
  _xpcom_categories: [{category:"profile-after-change"}],

  // method of nsIClassInfo
  getInterfaces: function(count) {
    var interfaceList = [Ci.nsIClassInfo];
    count.value = interfaceList.length;
    return interfaceList;
  },

  // method of nsIClassInfo
  getHelperForLanguage: function(count) { return null; },

  _walkObj: function(soFar, obj) {
    for (let m in obj) {
      this.logger.log(2, soFar+"."+m);
      if (obj[m] != obj)
        this._walkObj(soFar+"."+m, obj[m]);
    }
  },

  // observer interface implementation
  // topic:   what event occurred
  // subject: what nsIPrefBranch we're observing
  // data:    which pref has been changed (relative to subject)
  observe: function(subject, topic, data)
  {
      if (topic != "sessionstore-state-write") return;
      this.logger.log(3, "Got Session Store observe: "+topic);
      subject = subject.QueryInterface(Ci.nsISupportsString);

      // Bug 1506: This is the only important bit, other than
      // the registration goop. You don't even need the JSON 
      // garbage...
      // 
      // Simply block sessionstore writes entirely in Tor Browser
      try {
        if (this.prefs.getCharPref("torbrowser.version")) {
          this.logger.log(3, "Blocking SessionStore write in Tor Browser");
          subject.data = null;
          return;
        }
      } catch(e) {
      }

      // End 1506. Rest of this function can be ignored.

      this.logger.log(2, "Parsing JSON: "+subject);

      var state = this._safeJSONparse(subject);
      if (!"windows" in state) {
        this.logger.log(4, "Got a session store write but with no windows?");
        return;
      }
      var bypass_tor = this.prefs.getBoolPref("extensions.torbutton.notor_sessionstore");
      var bypass_nontor = this.prefs.getBoolPref("extensions.torbutton.nonontor_sessionstore");

      // This is all debugging and should be removed
      //this.logger.log(2, "Parsed Session Store: "+state);
      //this._walkObj("state", state);

      // XXX: It appears that if we filter out everything, firefox quits after restoring the
      // blank store
      for (let w in state.windows) {
         // FIXME: Can we just kill state.windows.0._hosts and cookies?
         // There seems to be no reason to store either of these in the session store..
         state.windows[w]._hosts = {};
         if (state.windows[w].cookies)
           delete state.windows[w].cookies;

         if (!"tabs" in state.windows[w]) {
           this.logger.log(4, "Got a session store write for a window with no tabs?");
           continue;
         }
         // Prune state.windows.0.tabs.0.extData.__tb_tor_fetched.0
         for (let t = state.windows[w].tabs.length - 1; t >= 0; t--) {
           if ("extData" in state.windows[w].tabs[t]
               && "__tb_tor_fetched" in state.windows[w].tabs[t].extData) {
             if((bypass_tor
                 && state.windows[w].tabs[t].extData.__tb_tor_fetched == "true") ||
                (bypass_nontor
                 && state.windows[w].tabs[t].extData.__tb_tor_fetched == "false")) {
               this.logger.log(3,
                    "Blocking session store save of tab from opposite tor state:"
                     +bypass_tor+", "+state.windows[w].tabs[t].extData.__tb_tor_fetched+", "
                     +bypass_nontor+", "+state.windows[w].tabs[t].extData.__tb_tor_fetched);
               state.windows[w].tabs.splice(t,1);
             }
           } else {
             this.logger.log(4, "Got a tab with no extension data?");
           }
         }
         if (!"_closedTabs" in state.windows[w]) {
           this.logger.log(3, "Window has no closed tabs");
           continue;
         }
         // Prune state.windows.0._closedTabs.0.state.extData.__tb_tor_fetched.1
         for (let t = state.windows[w]._closedTabs.length - 1; t >= 0; t--) {
           if ("extData" in state.windows[w]._closedTabs[t].state
                   && "__tb_tor_fetched" in state.windows[w]._closedTabs[t].state.extData) {
             if((bypass_tor
                 && state.windows[w]._closedTabs[t].state.extData.__tb_tor_fetched == "true") ||
                (bypass_nontor
                 && state.windows[w]._closedTabs[t].state.extData.__tb_tor_fetched == "false")) {
               this.logger.log(3, "Blocking session store save of closed tab from opposite tor state.");
               state.windows[w]._closedTabs.splice(t,1);
             }
           } else {
             this.logger.log(4, "Got a tab with no extension data?");
           }
         }
      }
      subject.data = this._toJSONString(state);
      this.logger.log(2, "Filtered Session Store JSON: "+subject);

      // This is all debugging and should be removed
      //var state = this._safeJSONparse(subject);
      //this.logger.log(2, "Parsed Session Store: "+state);
      //this._walkObj("state", state);
  },

  _safeJSONparse: function(aStr) {
    if (this.is_ff4) {
      return JSON.parse(aStr);
    } else {
      return Cu.evalInSandbox(aStr, new Cu.Sandbox("about:blank"));
    }
  },

  /**
   * Converts a JavaScript object into a JSON string
   * (see http://www.json.org/ for more information).
   *
   * This method is hacked due to bug 485563...
   */
  _toJSONString: function(aJSObject) {
    // XXXzeniko drop the following keys used only for internal bookkeeping:
    //           _tabStillLoading, _hosts, _formDataSaved
    if (this.is_ff4) {
      return JSON.stringify(aJSObject);
    } else {
      let jsonString = JSON.stringify(aJSObject);

      if (/[\u2028\u2029]/.test(jsonString)) {
        // work-around for bug 485563 until we can use JSON.parse
        // instead of evalInSandbox everywhere
        jsonString = jsonString.replace(/[\u2028\u2029]/g,
                                        function($0) "\\u" + $0.charCodeAt(0).toString(16));
      }

      return "("+jsonString+")";
    }
  }
};

/**
* XPCOMUtils.generateNSGetFactory was introduced in Mozilla 2 (Firefox 4).
* XPCOMUtils.generateNSGetModule is for Mozilla 1.9.2 (Firefox 3.6).
*/
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
// XXX: This won't work for FF3... We need to not register ourselves here..
if (XPCOMUtils.generateNSGetFactory)
  var NSGetFactory = XPCOMUtils.generateNSGetFactory([TBSessionBlocker]);
else
  var NSGetModule = XPCOMUtils.generateNSGetModule([TBSessionBlocker]);
