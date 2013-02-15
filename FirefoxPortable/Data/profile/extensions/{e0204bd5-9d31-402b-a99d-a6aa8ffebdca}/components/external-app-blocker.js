// Bug 1506 Android P1/TBB P5: This code providers users with notification
// in the event of external app launch. We want it to exist in the desktop
// port, but it is probably useless for Android.

/*************************************************************************
 * External App Handler.
 * Handles displaying confirmation dialogs for external apps and protocols
 * due to Firefox Bug https://bugzilla.mozilla.org/show_bug.cgi?id=440892
 *************************************************************************/

// Module specific constants
const kMODULE_NAME = "Torbutton External App Handler";

const kMODULE_CONTRACTID_APP = "@mozilla.org/uriloader/external-helper-app-service;1";
const kMODULE_CONTRACTID_PROTO = "@mozilla.org/uriloader/external-protocol-service;1";
const kMODULE_CONTRACTID_MIME = "@mozilla.org/mime;1";

const kMODULE_CONTRACTID_DRAG = "@mozilla.org/widget/dragservice;1";


const kMODULE_CID = Components.ID("3da0269f-fc29-4e9e-a678-c3b1cafcf13f");

/* Mozilla defined interfaces for FF3.0 */
const kREAL_EXTERNAL_CID = "{A7F800E0-4306-11d4-98D0-001083010E9B}";
const kExternalInterfaces = ["nsIObserver", "nsIMIMEService",
                             "nsIExternalHelperAppService",
                             "nsISupportsWeakReference", // XXX: Uh-oh...
                             "nsIExternalProtocolService",
                             "nsPIExternalAppLauncher"];
                             
const kREAL_DRAG_CID = "{8b5314bb-db01-11d2-96ce-0060b0fb9956}";
const kDragInterfaces = ["nsIDragService"];

const Cr = Components.results;
const Cc = Components.classes;
const Ci = Components.interfaces;

var appInfo = Components.classes["@mozilla.org/xre/app-info;1"]
                .getService(Components.interfaces.nsIXULAppInfo);
var versionChecker = Components.classes["@mozilla.org/xpcom/version-comparator;1"]
                       .getService(Components.interfaces.nsIVersionComparator);
var is_ff3 = (versionChecker.compare(appInfo.version, "3.0a1") >= 0);

function ExternalWrapper() {
  this.logger = Components.classes["@torproject.org/torbutton-logger;1"]
      .getService(Components.interfaces.nsISupports).wrappedJSObject;
  this.logger.log(3, "Component Load 0: New ExternalWrapper.");

  this._real_external = Components.classesByID[kREAL_EXTERNAL_CID];
  this._real_drag = Components.classesByID[kREAL_DRAG_CID];
  this._interfaces = kExternalInterfaces;

  this._prefs = Components.classes["@mozilla.org/preferences-service;1"]
      .getService(Components.interfaces.nsIPrefBranch);

  this._external = function() {
    var external = this._real_external.getService();
    for (var i = 0; i < this._interfaces.length; i++) {
      external.QueryInterface(Components.interfaces[this._interfaces[i]]);
    }
    return external;
  };
    
  this.copyMethods(this._external());

  this._drag = function() {
    var drag = this._real_drag.getService();
    for (var i = 0; i < kDragInterfaces.length; i++) {
      drag.QueryInterface(Components.interfaces[kDragInterfaces]);
    }
    return drag;
  };
  this.copyMethods(this._drag());
}

ExternalWrapper.prototype =
{
  QueryInterface: function(iid) {
    if (iid.equals(Components.interfaces.nsIClassInfo)
        || iid.equals(Components.interfaces.nsISupports)) {
      return this;
    }

    try {
      var external = this._external().QueryInterface(iid);
      this.copyMethods(external);
    } catch(e) {
      var drag = this._drag().QueryInterface(iid);
      this.copyMethods(drag);
    }
    return this;
  },

  // make this an nsIClassInfo object
  flags: Components.interfaces.nsIClassInfo.DOM_OBJECT,

  // method of nsIClassInfo

  classDescription: "@mozilla.org/uriloader/external-helper-app-service;1",
  contractID: "@mozilla.org/uriloader/external-helper-app-service;1",
  classID: kMODULE_CID,

  // method of nsIClassInfo
  getInterfaces: function(count) {
    var interfaceList = [Components.interfaces.nsIClassInfo];
    for (var i = 0; i < this._interfaces.length; i++) {
      interfaceList.push(Components.interfaces[this._interfaces[i]]);
    }

    for (var i = 0; i < kDragInterfaces.length; i++) {
      interfaceList.push(Components.interfaces[kDragInterfaces[i]]);
    }

    count.value = interfaceList.length;
    return interfaceList;
  },

  // method of nsIClassInfo  
  getHelperForLanguage: function(count) { return null; },

  /* Determine whether we should ask the user to run the app */
  blockApp: function() {
    return this._prefs.getBoolPref("extensions.torbutton.tor_enabled");
  },

  /* Copies methods from the true object we are wrapping */
  copyMethods: function(wrapped) {
    var mimic = function(newObj, method) {
       if(typeof(wrapped[method]) == "function") {
          // Code courtesy of timeless: 
          // http://www.webwizardry.net/~timeless/windowStubs.js
          var params = [];
          params.length = wrapped[method].length;
          var x = 0;
          var call;
          if(params.length) call = "("+params.join().replace(/(?:)/g,function(){return "p"+(++x)})+")";
          else call = "()";
          if(method == "getTypeFromFile" || method == "getTypeFromExtension" || method == "getTypeFromURI") {
           // XXX: Due to https://developer.mozilla.org/en/Exception_logging_in_JavaScript
           // this is necessary to prevent error console noise on the return to C++ code.
           // It is not technically correct, but as far as I can tell, returning null
           // here should be equivalent to throwing an error for the codepaths invovled
           var fun = "(function "+call+"{"+
              "if (arguments.length < "+wrapped[method].length+")"+
              "  throw Components.results.NS_ERROR_XPC_NOT_ENOUGH_ARGS;"+
              "try { return wrapped."+method+".apply(wrapped, arguments); }"+
              "catch(e) { if(e.result == Components.results.NS_ERROR_NOT_AVAILABLE) return null; else throw e;} })";
            newObj[method] = eval(fun);
          } else {
            var fun = "(function "+call+"{"+
              "if (arguments.length < "+wrapped[method].length+")"+
              "  throw Components.results.NS_ERROR_XPC_NOT_ENOUGH_ARGS;"+
              "return wrapped."+method+".apply(wrapped, arguments);})";
            newObj[method] = eval(fun);
          }
       } else {
          newObj.__defineGetter__(method, function() { return wrapped[method]; });
          newObj.__defineSetter__(method, function(val) { wrapped[method] = val; });
      }
    };
    for (var method in wrapped) {
      if(typeof(this[method]) == "undefined") mimic(this, method);
    }
  },

  loadURI: function(aUri, aContext) {
    if(this.blockApp()) {
      var check = {value: false};
      var result = this._confirmLaunch(aUri.spec, check);

      if (result != 0) {
        return null;
      }
    }
 
    return this._external().loadURI(aUri, aContext);
  },

  // loadUrl calls loadURI

  _confirmLaunch: function(urispec, check) {
    if (!this._prefs.getBoolPref("extensions.torbutton.launch_warning")) {
      return 0;
    }

    var wm = Cc["@mozilla.org/appshell/window-mediator;1"]
               .getService(Components.interfaces.nsIWindowMediator);
    var chrome = wm.getMostRecentWindow("navigator:browser");

    var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                            .getService(Components.interfaces.nsIPromptService);
    var flags = prompts.BUTTON_POS_0 * prompts.BUTTON_TITLE_IS_STRING +
                prompts.BUTTON_POS_1 * prompts.BUTTON_TITLE_IS_STRING +
                prompts.BUTTON_DELAY_ENABLE +
                prompts.BUTTON_POS_1_DEFAULT;

    var bundle = chrome.torbutton_get_stringbundle();

    var title = bundle.GetStringFromName("torbutton.popup.external.title");
    var app = bundle.GetStringFromName("torbutton.popup.external.app");
    var note = bundle.GetStringFromName("torbutton.popup.external.note");
    var suggest = bundle.GetStringFromName("torbutton.popup.external.suggest");
    var launch = bundle.GetStringFromName("torbutton.popup.launch");
    var cancel = bundle.GetStringFromName("torbutton.popup.cancel");
    var dontask = bundle.GetStringFromName("torbutton.popup.dontask");

    var result = prompts.confirmEx(chrome, title, app+urispec+note+suggest+" ",
                                   flags, launch, cancel, "", dontask, check);

    if (check.value) {
      this._prefs.setBoolPref("extensions.torbutton.launch_warning", false);
    }

    return result;
  },
  
  doContent: function(aMimeContentType, aRequest, aWindowContext, aForceSave) {
    if(this.blockApp()) {
      var check = {value: false};
      var result = this._confirmLaunch(aRequest.name, check);

      if (result != 0) {
        return null;
      }
    }
 
    return this._external().doContent(aMimeContentType, aRequest, aWindowContext, aForceSave);
  },

  // from nsIDragService
  invokeDragSessionWithImage: function(aDOMNode, aTransferableArray, aRegion, aActionType, aImage, aImageX, aImageY, aDragEvent, aDataTransfer) {
    for(var i = 0; i < aTransferableArray.Count(); i++) {
        this.logger.log(3, "Inspecting drag+drop transfer: "+i);
        var tr = aTransferableArray.GetElementAt(i);
        tr.QueryInterface(Ci.nsITransferable);

        var flavors = tr.flavorsTransferableCanExport()
                        .QueryInterface(Ci.nsISupportsArray);

        for (var f=0; f < flavors.Count(); f++) {
          var flavor =flavors.GetElementAt(f); 
          flavor.QueryInterface(Ci.nsISupportsCString);

          this.logger.log(3, "Got drag+drop flavor: "+flavor);
          if (flavor == "text/x-moz-url" ||
              flavor == "text/x-moz-url-data" ||
              flavor == "text/uri-list" ||
              flavor == "application/x-moz-file-promise-url") {
            this.logger.log(3, "Removing "+flavor);
            try { tr.removeDataFlavor(flavor); } catch(e) {}
          }
        }
    }

    return this._drag().invokeDragSessionWithImage(aDOMNode, aTransferableArray, aRegion, aActionType, aImage, aImageX, aImageY, aDragEvent, aDataTransfer);
  },

};

var ExternalWrapperSingleton = null;
var ExternalWrapperFactory = new Object();

ExternalWrapperFactory.createInstance = function (outer, iid)
{
  if (outer != null) {
    Components.returnCode = Cr.NS_ERROR_NO_AGGREGATION;
    return null;
  }

  if(!ExternalWrapperSingleton)
    ExternalWrapperSingleton = new ExternalWrapper();

  return ExternalWrapperSingleton;
};


/**
 * JS XPCOM component registration goop:
 *
 * Everything below is boring boilerplate and can probably be ignored.
 */

var ExternalWrapperModule = new Object();

ExternalWrapperModule.registerSelf = 
function (compMgr, fileSpec, location, type) {
  var nsIComponentRegistrar = Components.interfaces.nsIComponentRegistrar;
  compMgr = compMgr.QueryInterface(nsIComponentRegistrar);
  compMgr.registerFactoryLocation(kMODULE_CID,
                                  kMODULE_NAME,
                                  kMODULE_CONTRACTID_APP,
                                  fileSpec,
                                  location,
                                  type);

  compMgr.registerFactoryLocation(kMODULE_CID,
                                  kMODULE_NAME,
                                  kMODULE_CONTRACTID_PROTO,
                                  fileSpec,
                                  location,
                                  type);

  compMgr.registerFactoryLocation(kMODULE_CID,
                                  kMODULE_NAME,
                                  kMODULE_CONTRACTID_MIME,
                                  fileSpec,
                                  location,
                                  type);

  compMgr.registerFactoryLocation(kMODULE_CID,
                                  kMODULE_NAME,
                                  kMODULE_CONTRACTID_DRAG,
                                  fileSpec,
                                  location,
                                  type);

};

ExternalWrapperModule.getClassObject = function (compMgr, cid, iid)
{
  if (cid.equals(kMODULE_CID))
    return ExternalWrapperFactory;

  Components.returnCode = Cr.NS_ERROR_NOT_REGISTERED;
  return null;
};

ExternalWrapperModule.canUnload = function (compMgr)
{
  return true;
};

/**
* XPCOMUtils.generateNSGetFactory was introduced in Mozilla 2 (Firefox 4).
* XPCOMUtils.generateNSGetModule is for Mozilla 1.9.2 (Firefox 3.6).
*/
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
if (XPCOMUtils.generateNSGetFactory) {
    var NSGetFactory = XPCOMUtils.generateNSGetFactory([ExternalWrapper]);
} else {
    function NSGetModule(compMgr, fileSpec)
    {
      return ExternalWrapperModule;
    }
}

