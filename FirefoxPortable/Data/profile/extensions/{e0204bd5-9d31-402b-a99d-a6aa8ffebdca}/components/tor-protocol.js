// Bug 1506 P0: This code is toggle-mode code and is unused. Kill it.

// Test protocol related
const kSCHEME = "tor";
const kPROTOCOL_NAME = "tor";
const kPROTOCOL_CONTRACTID = "@mozilla.org/network/protocol;1?name=" + kSCHEME;
const kPROTOCOL_CID = Components.ID("52183e20-4d4b-11de-8a39-0800200c9a66");

// Mozilla defined
const kSIMPLEURI_CONTRACTID = "@mozilla.org/network/simple-uri;1";
const kIOSERVICE_CONTRACTID = "@mozilla.org/network/io-service;1";
const nsISupports = Components.interfaces.nsISupports;
const nsIIOService = Components.interfaces.nsIIOService;
const nsIProtocolHandler = Components.interfaces.nsIProtocolHandler;
const nsIURI = Components.interfaces.nsIURI;

function Protocol()
{
}

Protocol.prototype =
{
  QueryInterface: function(iid)
  {
    if (!iid.equals(nsIProtocolHandler) &&
        !iid.equals(nsISupports))
      throw Components.results.NS_ERROR_NO_INTERFACE;
    return this;
  },

  scheme: kSCHEME,
  defaultPort: -1,
  protocolFlags: nsIProtocolHandler.URI_NORELATIVE |
                 nsIProtocolHandler.URI_NOAUTH,
  
  allowPort: function(port, scheme)
  {
    return false;
  },

  newURI: function(spec, charset, baseURI)
  {
    const nsIStandardURL = Components.interfaces.nsIStandardURL;
    var uri = Components.classes["@mozilla.org/network/standard-url;1"].createInstance(nsIStandardURL);
    uri.init(nsIStandardURL.URLTYPE_STANDARD, 80, spec, charset, baseURI);

    return uri.QueryInterface(Components.interfaces.nsIURI);

  },

  newChannel: function(aURI)
  {
    var prefs = Components.classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefBranch);
    if (!prefs.getBoolPref("extensions.torbutton.tor_urls")) {
      throw Components.results.NS_ERROR_UNKNOWN_PROTOCOL;
    }

    /*The protocol has been called, therefore we want to enable tor, wait for it to activate return the new channel with the scheme of http.*/
    var ios = Components.classes[kIOSERVICE_CONTRACTID].getService(nsIIOService);
    var prompt = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                        .getService(Components.interfaces.nsIPromptService);
    var tor_enabled = prefs.getBoolPref("extensions.torbutton.tor_enabled");
    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                         .getService(Components.interfaces.nsIWindowMediator);
    var chrome = wm.getMostRecentWindow("navigator:browser");
    if (!ios.allowPort(aURI.port, aURI.scheme))
      throw Components.results.NS_ERROR_FAILURE;
    
    if (!tor_enabled)
    {
      var result = prompt.confirm(null, "Allow Tor toggle?", "Do you want to enable Tor and navigate to " + aURI.spec + "?");   
      if (!result)
        throw Components.results.NS_ERROR_UNEXPECTED;        
      chrome.torbutton_enable_tor(true);    
    } 
    
    //if tor is turned on then, else we should throw exception of some sort.
    tor_enabled = prefs.getBoolPref("extensions.torbutton.tor_enabled");
    if (!tor_enabled)
        throw Components.results.NS_ERROR_UNEXPECTED;
    else
    {
        aURI.scheme = "http";    
        return ios.newChannelFromURI(aURI);
    }      
  },

  // method of nsIClassInfo
  classDescription: "Tor protocol handler",
  classID: kPROTOCOL_CID,
  contractID: kPROTOCOL_CONTRACTID,
}

/**
* XPCOMUtils.generateNSGetFactory was introduced in Mozilla 2 (Firefox 4).
* XPCOMUtils.generateNSGetModule is for Mozilla 1.9.2 (Firefox 3.6).
*/
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
if (XPCOMUtils.generateNSGetFactory)
    var NSGetFactory = XPCOMUtils.generateNSGetFactory([Protocol]);
else
    var NSGetModule = XPCOMUtils.generateNSGetModule([Protocol]);
