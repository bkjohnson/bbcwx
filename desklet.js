/* 
 * bbcwx - a Cinnamon Desklet displaying the weather retrieved
 * from one of several web services.
 * 
 * Copyright 2014 Chris Hastie. Forked from accudesk@logan; original
 * code Copyright 2013 loganj. 
 * 
 * Includes the marknote library, Copyright 2011 jbulb.org. 
 * Icons Copyright 2010 Merlin the Red, 2010 VClouds, 2010
 * d3stroy and 2004 digitalchet.
 * See help.html for further credits and license information.
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

const Gio = imports.gi.Gio;
const St = imports.gi.St;
const Desklet = imports.ui.desklet;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Clutter = imports.gi.Clutter;  
const GLib = imports.gi.GLib;
const Tweener = imports.ui.tweener;
const Util = imports.misc.util;
const Main = imports.ui.main;

const Tooltips = imports.ui.tooltips;
const PopupMenu = imports.ui.popupMenu;
const Cinnamon = imports.gi.Cinnamon;
const Settings = imports.ui.settings;

const Soup = imports.gi.Soup;
// const JSON = imports.JSON;

const UUID = "bbcwx@oak-wood.co.uk";
const DESKLET_DIR = imports.ui.deskletManager.deskletMeta[UUID].path;

imports.searchPath.push(DESKLET_DIR);
const xml = imports.marknote;

const _httpSession = new Soup.SessionAsync();
Soup.Session.prototype.add_feature.call(_httpSession, new Soup.ProxyResolverDefault());

// Set up some constants for layout and styling
const BBCWX_TEXT_SIZE = 14;
const BBCWX_CC_TEXT_SIZE = 24;
const BBCWX_LABEL_TEXT_SIZE = 11;
const BBCWX_LINK_TEXT_SIZE = 10;
const BBCWX_REFRESH_ICON_SIZE=14;
const BBCWX_TABLE_ROW_SPACING=2;
const BBCWX_TABLE_COL_SPACING=5;
const BBCWX_TABLE_PADDING=5;
const BBCWX_CONTAINER_PADDING=12;
const BBCWX_ICON_HEIGHT = 40;
const BBCWX_ICON_WIDTH = 40;
const BBCWX_CC_ICON_HEIGHT =170;
const BBCWX_CC_ICON_WIDTH =170;
const BBCWX_BUTTON_PADDING=3;
const BBCWX_TEMP_PADDING=12;
const BBCWX_SEPARATOR_STYLE = 'bbcwx-separator';
const BBCWX_SERVICE_STATUS_ERROR = 0;
const BBCWX_SERVICE_STATUS_INIT = 1;
const BBCWX_SERVICE_STATUS_OK = 2;

function MyDesklet(metadata,desklet_id){
  this._init(metadata,desklet_id);
}

MyDesklet.prototype = {
  __proto__: Desklet.Desklet.prototype,
    

  _init: function(metadata,desklet_id){
    //############Variables###########
    this.desklet_id = desklet_id;
    this.daynames={Mon: _('Mon'),Tue: _('Tue'), Wed: _('Wed'), Thu: _('Thu'), Fri: _('Fri'), Sat: _('Sat'), Sun: _('Sun')};
    this.fwicons=[];this.labels=[];this.max=[];this.min=[];this.windd=[];this.winds=[];this.tempn=[];this.eachday=[];this.wxtooltip=[];
    this.cc=[];this.days=[];
    this.metadata = metadata;
    this.oldno=0; // test for a change in this.no
    this.oldwebservice='';
    this.oldshifttemp='';
    this.redrawNeeded=false;
        
    //################################
    
    try {
      Desklet.Desklet.prototype._init.call(this, metadata);
      //#########################binding configuration file################
      this.settings = new Settings.DeskletSettings(this, UUID, this.desklet_id);  
      // these changes require only a change to the styling of the desklet:
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"units","units",this.updateStyle,null);
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"wunits","wunits",this.updateStyle,null);
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"punits","punits",this.updateStyle,null);
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"transparency","transparency",this.updateStyle,null);
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"textcolor","textcolor",this.updateStyle,null);
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"bgcolor","bgcolor",this.updateStyle,null);
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"zoom","zoom",this.updateStyle,null);
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"border","border",this.updateStyle,null);
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"bordercolor","bordercolor",this.updateStyle,null);
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"borderwidth","borderwidth",this.updateStyle,null);
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"iconstyle","iconstyle",this.updateStyle,null);
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"citystyle","citystyle",this.updateStyle,null);
      // this change requires us to fetch new data:
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"stationID","stationID",this.changeStation,null);
      // this requires a change of API key and refetch data
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"apikey","apikey",this.changeApiKey,null);
      // this change requires the main loop to be restarted, but no other updates
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"refreshtime","refreshtime",this.changeRefresh,null);
      // these changes potentially need a redraw of the window, but not a refetch of data
      // layout because the position of the current temperature may change
      // userno because of change to number of days in table, and possibly position of current temperature
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"layout","layout",this.displayOptsChange,null);
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"userno","userno",this.redraw,null);
      
      // these need a redraw. displayOptsChange sets a flag to say a redraw is needed before calling redraw
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"display__cc__pressure","display__cc__pressure",this.displayOptsChange,null);
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"display__cc__humidity","display__cc__humidity",this.displayOptsChange,null);
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"display__cc__feelslike","display__cc__feelslike",this.displayOptsChange,null);
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"display__cc__wind_speed","display__cc__wind_speed",this.displayOptsChange,null);
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"display__cc__visibility","display__cc__visibility",this.displayOptsChange,null);
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"display__forecast__wind_speed","display__forecast__wind_speed",this.displayOptsChange,null);
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"display__forecast__wind_direction","display__forecast__wind_direction",this.displayOptsChange,null);
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"display__forecast__maximum_temperature","display__forecast__maximum_temperature",this.displayOptsChange,null);
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"display__forecast__minimum_temperature","display__forecast__minimum_temperature",this.displayOptsChange,null);
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"display__forecast__pressure","display__forecast__pressure",this.displayOptsChange,null);
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"display__forecast__humidity","display__forecast__humidity",this.displayOptsChange,null);

      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"display__meta__country","display__meta__country",this.updateStyle,null);
      
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"display__cc__weather","display__cc__weather",this.displayOptsChange,null);
      
      // a change to webservice requires data to be fetched and the window redrawn
      this.settings.bindProperty(Settings.BindingDirection.ONE_WAY,"webservice","webservice",this.initForecast,null);

      this.helpFile = DESKLET_DIR + "/help.html"; 
      this._menu.addAction(_("Help"), Lang.bind(this, function() {
        Util.spawnCommandLine("xdg-open " + this.helpFile);
      }));
      
      this.initForecast();
      
    }
    catch (e) {
      global.logError(e);
    }
    return true;
  },

  ////////////////////////////////////////////////////////////////////////////
  // Set everything up initially
  initForecast: function() {
    if (this.service) delete this.service;
    // select the the driver we need for this service
    switch(this.webservice) {
      case 'bbc':
        this.service = new wxDriverBBC(this.stationID);
        break;
      case 'mock':
        this.service = new wxDriverMock(this.stationID);
        break;
      case 'yahoo':
        this.service = new wxDriverYahoo(this.stationID);
        break;
      case 'owm':
        this.service = new wxDriverOWM(this.stationID, this.apikey);
        break;
      case 'wunderground':
        this.service = new wxDriverWU(this.stationID, this.apikey);
        break;
      case 'wwo':
        this.service = new wxDriverWWO(this.stationID, this.apikey);
        break;
      case 'forecast':
        this.service = new wxDriverForecastIo(this.stationID, this.apikey);
        break;
      case 'twc':
        this.service = new wxDriverTWC(this.stationID);
        break;
      default:
        this.service = new wxDriverBBC(this.stationID);
    }
    
    this._setDerivedValues();
    this._createWindow(); 
    this._update_style();
    this._refreshweathers();    
  },
  
  ////////////////////////////////////////////////////////////////////////////
  // Create the layout of our desklet. Certain settings changes require this
  // to be called again (eg change service, as capabilities change, change number 
  // days of forecast to display
  _createWindow: function(){
    // in these circumstances we do not need to redraw the window from scratch as the elements haven't changed
    if((this.no == this.oldno) && (this.oldwebservice == this.webservice) && (this.shifttemp == this.oldshifttemp) && !this.redrawNeeded) {       
      return;
    }      
 
    this.oldno=this.no;
    this.oldwebservice = this.webservice;
    this.oldshifttemp = this.shifttemp;
    this.redrawNeeded = false;
    
    // get rid of the signal to banner and main icon before we recreate a window
    try {
      if (this.bannersig) this.banner.disconnect(this.bannersig);
      if (this.cwiconsig && this.cwicon) this.cwicon.disconnect(this.cwiconsig);
      this.bannersig = null;
      this.cwiconsig = null;
    } catch(e) { }  
    
    this.window=new St.BoxLayout({vertical: ((this.vertical==1) ? true : false)});
    this.cwicon = null;
    // container for link and refresh icon
    this.buttons=new St.BoxLayout({vertical: false,style: "padding-top:"+BBCWX_BUTTON_PADDING*this.zoom+"px;padding-bottom:"+BBCWX_BUTTON_PADDING*this.zoom+"px",x_align:2, y_align:2 });
    // refresh icon
    this.iconbutton=new St.Icon({ icon_name: 'view-refresh-symbolic',
      icon_size: BBCWX_REFRESH_ICON_SIZE*this.zoom+'',
      icon_type: St.IconType.SYMBOLIC,
      style: "padding: 0 0 0 3px;"
    });
    this.but=new St.Button(); // container for refresh icon
    
    // these will hold the data for the three day forecast
    this.labels=[]; this.fwicons=[];this.max=[]; this.min=[]; this.windd=[]; this.winds=[]; 
    this.fhumidity=[]; this.fpressure=[]; this.eachday=[];
    
    // some labels need resetting incase we are redrawing after a change of service
    this.humidity=null; this.pressure=null; this.windspeed=null; this.feelslike=null;
    
    this._separatorArea = new St.DrawingArea({ style_class: BBCWX_SEPARATOR_STYLE });
    
    let ccap = this.show.cc;
    
    // current weather values
    if(ccap.humidity) this.humidity=new St.Label();
    if(ccap.pressure) this.pressure=new St.Label();
    if(ccap.wind_speed) this.windspeed=new St.Label();
    if(ccap.feelslike) this.feelslike=new St.Label();
    if(ccap.visibility) this.visibility=new St.Label();    
    
    // container for current weather values
    this.ctemp_values = new St.BoxLayout({vertical: true, y_align: 2, style : 'text-align : left; font-size: '+BBCWX_TEXT_SIZE*this.zoom+"px"});
    // container for current weather labels
    this.ctemp_captions = new St.BoxLayout({vertical: true, y_align: 2, style : 'text-align : right'});
    // container for current weather
    this.ctemp = new St.BoxLayout({vertical: false, x_align: 2, y_align: 2});
    
    // city and city container
    this.cityname=new St.Label({style: "text-align: center;font-size: "+BBCWX_TEXT_SIZE*this.zoom+"px" });
    this.city=new St.BoxLayout({vertical:true,style: "align: center;"});
    
    // container for right (horizontal) or lower (vertical) part of window
    this.container= new St.BoxLayout({vertical: true, x_align: 2});//definire coloana dreapta
    // container for left (horizontal) or upper (vertical) part of window
    this.cweather = new St.BoxLayout({vertical: true, x_align: 2}); //definire coloana stangz
    // current weather icon container
    if (ccap.weather) this.cwicon = new St.Button({height: (BBCWX_CC_ICON_HEIGHT*this.zoom), width: (BBCWX_CC_ICON_HEIGHT*this.iconprops.aspect*this.zoom)}); //icoana mare cu starea vremii
    // current weather text
    if (ccap.weather) this.weathertext=new St.Label({style: 'text-align : center; font-size:'+BBCWX_CC_TEXT_SIZE*this.zoom+'px'}); //-textul cu starea vremii de sub ditamai icoana :)
    
    // current temp on wide layouts
    if (this.shifttemp) {
      this.ctemp_bigtemp = new St.BoxLayout({vertical: false, x_align: 3, y_align: 2, style : 'text-align : left; padding-right: ' + this.currenttempadding *this.zoom + 'px'});
      this.currenttemp=new St.Label({style: 'text-align : center; font-size:'+BBCWX_CC_TEXT_SIZE*this.zoom+'px'});
      this.ctemp_bigtemp.add_actor(this.currenttemp);
      this.ctemp.add_actor(this.ctemp_bigtemp);
    }
    
    this.city.add_actor(this.cityname); 

    if(ccap.humidity) this.ctemp_captions.add_actor(new St.Label({text: _('Humidity: ')}));
    if(ccap.pressure) this.ctemp_captions.add_actor(new St.Label({text: _('Pressure: ')}));
    if(ccap.wind_speed) this.ctemp_captions.add_actor(new St.Label({text: _('Wind: ')}));
    if(ccap.feelslike) this.ctemp_captions.add_actor(new St.Label({text: _('Feels like: ')}));
    if(ccap.visibility) this.ctemp_captions.add_actor(new St.Label({text: _('Visibility: ')}));
    
    if(this.humidity) this.ctemp_values.add_actor(this.humidity);
    if(this.pressure) this.ctemp_values.add_actor(this.pressure);
    if(this.windspeed) this.ctemp_values.add_actor(this.windspeed);
    if(this.feelslike) this.ctemp_values.add_actor(this.feelslike);
    if(this.visibility) this.ctemp_values.add_actor(this.visibility);
    
    this.ctemp.add_actor(this.ctemp_captions); //-adauga coloana din stanga la informatii
    this.ctemp.add_actor(this.ctemp_values);  //adauga coloana din dreapta la informatii     
    
    // build table to hold three day forecast
    this.fwtable =new St.Table({style: "spacing-rows: "+BBCWX_TABLE_ROW_SPACING*this.zoom+"px;spacing-columns: "+BBCWX_TABLE_COL_SPACING*this.zoom+"px;padding: "+BBCWX_TABLE_PADDING*this.zoom+"px;"});
    this.maxlabel = new St.Label({text: _('Max:'), style: 'text-align : right;font-size: '+BBCWX_LABEL_TEXT_SIZE*this.zoom+"px"});
    this.minlabel = new St.Label({text: _('Min:'), style: 'text-align : right;font-size: '+BBCWX_LABEL_TEXT_SIZE*this.zoom+"px"});
    this.windlabel = new St.Label({text: _('Wind:'), style: 'text-align : right;font-size: '+BBCWX_LABEL_TEXT_SIZE*this.zoom+"px"});
    this.winddlabel = new St.Label({text: _('Dir:'), style: 'text-align : right;font-size: '+BBCWX_LABEL_TEXT_SIZE*this.zoom+"px"});
    this.fpressurelabel = new St.Label({text: _('Pressure:'), style: 'text-align : right;font-size: '+BBCWX_LABEL_TEXT_SIZE*this.zoom+"px"});
    this.fhumiditylabel = new St.Label({text: _('Humidity:'), style: 'text-align : right;font-size: '+BBCWX_LABEL_TEXT_SIZE*this.zoom+"px"});
    
    let fcap = this.show.forecast;
    let row = 2;
    
    if(fcap.maximum_temperature) {this.fwtable.add(this.maxlabel,{row:row,col:0}); row++}
    if(fcap.minimum_temperature) {this.fwtable.add(this.minlabel,{row:row,col:0}); row++}
    if(fcap.wind_speed) {this.fwtable.add(this.windlabel,{row:row,col:0}); row++}
    if(fcap.wind_direction) {this.fwtable.add(this.winddlabel,{row:row,col:0}); row++}
    if(fcap.pressure) {this.fwtable.add(this.fpressurelabel,{row:row,col:0}); row++}
    if(fcap.humidity) {this.fwtable.add(this.fhumiditylabel,{row:row,col:0}); row++}
    for(let f=0;f<this.no;f++) {
      this.labels[f]=new St.Button({label: '', style: 'color: ' + this.textcolor + ';text-align: center;font-size: '+BBCWX_TEXT_SIZE*this.zoom+"px" });
      this.fwicons[f]=new St.Button({height:BBCWX_ICON_HEIGHT*this.zoom, width: BBCWX_ICON_HEIGHT*this.iconprops.aspect*this.zoom});
      if(fcap.maximum_temperature) this.max[f]=new St.Label({style: 'text-align : center;font-size: '+BBCWX_TEXT_SIZE*this.zoom+"px"});
      if(fcap.minimum_temperature) this.min[f]=new St.Label({style: 'text-align : center;font-size: '+BBCWX_TEXT_SIZE*this.zoom+"px"});
      if(fcap.wind_speed) this.winds[f]=new St.Label({style: 'text-align : center;font-size: '+BBCWX_TEXT_SIZE*this.zoom+"px"});
      if(fcap.wind_direction) this.windd[f]=new St.Label({style: 'text-align : center;font-size: '+BBCWX_TEXT_SIZE*this.zoom+"px"});
      if(fcap.pressure) this.fpressure[f]=new St.Label({style: 'text-align : center;font-size: '+BBCWX_TEXT_SIZE*this.zoom+"px"});
      if(fcap.humidity) this.fhumidity[f]=new St.Label({style: 'text-align : center;font-size: '+BBCWX_TEXT_SIZE*this.zoom+"px"});
      this.wxtooltip[f] = new Tooltips.Tooltip(this.fwicons[f]);
      
      this.fwtable.add(this.labels[f],{row:0,col:f+1});
      this.fwtable.add(this.fwicons[f],{row:1,col:f+1});
      row = 2;
      if(this.max[f]) {this.fwtable.add(this.max[f],{row:row,col:f+1}); row++}
      if(this.min[f]) {this.fwtable.add(this.min[f],{row:row,col:f+1}); row++}
      if(this.winds[f]) {this.fwtable.add(this.winds[f],{row:row,col:f+1}); row++}
      if(this.windd[f]) {this.fwtable.add(this.windd[f],{row:row,col:f+1}); row++}
      if(this.fpressure[f]) {this.fwtable.add(this.fpressure[f],{row:row,col:f+1}); row++}
      if(this.fhumidity[f]) {this.fwtable.add(this.fhumidity[f],{row:row,col:f+1}); row++}
    }
    
    this.but.set_child(this.iconbutton);
    this.but.connect('clicked', Lang.bind(this, this.updateForecast));
    // seems we have to use a button for bannerpre to get the vertical alignment :(
    this.bannerpre=new St.Button({label: _('Data from '), style: 'font-size: '+BBCWX_LINK_TEXT_SIZE*this.zoom+"px; color: " + this.textcolor + ";"});
    this.banner=new St.Button({ 
      style: 'font-size: '+BBCWX_LINK_TEXT_SIZE*this.zoom+"px; color: " + this.textcolor + ";",
      reactive: true,
      track_hover: true,
      style_class: 'bbcwx-link'});
    this.bannertooltip = new Tooltips.Tooltip(this.banner);
    if (this.cwicon) this.cwicontooltip = new Tooltips.Tooltip(this.cwicon);
    this.refreshtooltip = new Tooltips.Tooltip(this.but, _('Refresh'));
    this.buttons.add_actor(this.bannerpre);
    this.buttons.add_actor(this.banner);
    this.buttons.add_actor(this.but);
    this.container.add_actor(this.ctemp);  
    this.container.add_actor(this._separatorArea);
    this.container.add_actor(this.fwtable); 
    this.cweather.add_actor(this.city);
    if (this.cwicon) this.cweather.add_actor(this.cwicon);
    if (this.weathertext) this.cweather.add_actor(this.weathertext);
    this.container.add_actor(this.buttons);
    this.window.add_actor(this.cweather);
    this.window.add_actor(this.container);
    
    this.setContent(this.window);
    
  },
  
  ////////////////////////////////////////////////////////////////////////////
  // Set some internal values derived from user choices
  _setDerivedValues: function() {
    
    this.vertical = this.layout;
    this.currenttempadding = BBCWX_TEMP_PADDING;
    this.currenttempsize = BBCWX_CC_TEXT_SIZE;
    
    // set the number of days of forecast to display; maximum of the number
    // selected by the user and the maximum supported by the driver
    if (this.userno > this.service.maxDays) {
      this.no = this.service.maxDays;
    } else {
      this.no = this.userno;
    }
    
    // set the refresh period; minimum of the number
    // selected by the user and the minimum supported by the driver
    this.refreshSec = this.refreshtime * 60;
    if (this.refreshSec < this.service.minTTL) {
      this.refreshSec = this.service.minTTL;
    }    
    
    // if more than four days we'll shift the position of the current temperature,
    // but only in horizontal layout
    // false: concatenate with weather text; true: shift to alongside current conditions;
    this.shifttemp = false;
    if (this.no > 4 && this.vertical == 0) {
      this.shifttemp = true;
    }
    
    // set this.iconprops
    this._initIcons();
    
    // clone this.service.capabilities, then && it with display preferences
    this.show =  JSON.parse(JSON.stringify(this.service.capabilities));
    let displayopts =['display__cc__pressure', 'display__cc__wind_speed', 
      'display__cc__humidity', 'display__cc__feelslike', 'display__cc__visibility',
      'display__forecast__wind_speed', 'display__forecast__wind_direction', 
      'display__forecast__maximum_temperature', 'display__forecast__minimum_temperature',
      'display__forecast__humidity', 'display__forecast__pressure',
      'display__meta__country'
    ];
    let ccShowCount=0;
    for (let i=0; i<displayopts.length; i++) {
      let parts=displayopts[i].split('__');
      this.show[parts[1]][parts[2]] = this.show[parts[1]][parts[2]] && this[displayopts[i]];
      if (parts[1] == 'cc' && this.show[parts[1]][parts[2]]) ccShowCount++;
    }
    
    // don't shift the current temp display position if 
    // no current conditions to display
    if (ccShowCount < 1) this.shifttemp = false;
    
    // if not showing current weather text and icon, force
    // to vertical and shift current temperature   
    this.show.cc.weather = this.display__cc__weather;
    if (!this.display__cc__weather) {
      this.shifttemp = true
      this.currenttempsize = this.currenttempsize*1.7;
      this.vertical = 1;
      // don't right pad the temperature if there's nothing to its right
      if (ccShowCount < 1) this.currenttempadding = 0;
    }     
  },
  
  ////////////////////////////////////////////////////////////////////////////
  // Set internal values for icons
  _initIcons: function() {
    this.iconprops = new Object();
    this.iconprops.aspect = 1;
    this.iconprops.ext = 'png';
    
    // Aspect ratios (w/h). Assume 1 if not in here
    let ARMap = {
      'vclouds': 1.458
    };
    
    // File extensions. Assume png if not in here
    let ExtMap = {};
    
    if (this.iconstyle == 'user') {
      let file = Gio.file_new_for_path(DESKLET_DIR + '/icons/user/iconmeta.json');
      try {
        let raw_file = Cinnamon.get_file_contents_utf8_sync(file.get_path());
        this.iconprops = JSON.parse(raw_file);    
      } catch(e) {
        global.logError("Failed to parse iconmeta.json for user defined icons. Using default iconset");
        // set to default values
        this.iconstyle = 'colourful';
        this.iconprops.aspect = 1;
        this.iconprops.ext = 'png';
      }
    } else {
      if (typeof ARMap[this.iconstyle] !== 'undefined') this.iconprops.aspect = ARMap[this.iconstyle];
      if (typeof ExtMap[this.iconstyle] !== 'undefined') this.iconprops.ext = ExtMap[this.iconstyle];
    }
    global.log('_initIcons set values ' + this.iconprops.aspect + ' ; ' + this.iconprops.ext + ' using ' + this.iconstyle);
  },
  
  
  ////////////////////////////////////////////////////////////////////////////
  // Called when some change requires the styling of the desklet to be updated    
  updateStyle: function() {
    // set values for this.iconprops
    this._setDerivedValues();
    // update style
    this._update_style();
    // also need to run these to update icon style and size
    this.displayForecast();
    this.displayCurrent();
    this.displayMeta();
  },
  
  ////////////////////////////////////////////////////////////////////////////
  // Does the bulk of the work of updating style
  _update_style: function() {
    //global.log("bbcwx (instance " + this.desklet_id + "): entering _update_style");
    this.window.vertical = (this.vertical==1) ? true : false;
    if (this.cwicon) {
      this.cwicon.height=BBCWX_CC_ICON_HEIGHT*this.zoom;
      this.cwicon.width=BBCWX_CC_ICON_HEIGHT*this.iconprops.aspect*this.zoom;
    }
    if (this.weathertext) this.weathertext.style= 'text-align : center; font-size:'+BBCWX_CC_TEXT_SIZE*this.zoom+'px';
    if (this.currenttemp) this.currenttemp.style= 'text-align : center; font-size:'+this.currenttempsize*this.zoom+'px';
    if (this.ctemp_bigtemp) this.ctemp_bigtemp.style = 'text-align : left; padding-right: ' + this.currenttempadding *this.zoom + 'px'
    this.fwtable.style="spacing-rows: "+BBCWX_TABLE_ROW_SPACING*this.zoom+"px;spacing-columns: "+BBCWX_TABLE_COL_SPACING*this.zoom+"px;padding: "+BBCWX_TABLE_PADDING*this.zoom+"px;";
    this.cityname.style="text-align: center;font-size: "+BBCWX_TEXT_SIZE*this.zoom+"px; font-weight: " + ((this.citystyle) ? 'bold' : 'normal') + ";" ;    
    this.ctemp_captions.style = 'text-align : right;font-size: '+BBCWX_TEXT_SIZE*this.zoom+"px";
    this.ctemp_values.style = 'text-align : left; font-size: '+BBCWX_TEXT_SIZE*this.zoom+"px";
    
    if (this.border) {
      let borderradius = (this.borderwidth > 12) ? this.borderwidth : 12;
      this.window.style="border: " + this.borderwidth + "px solid "+this.bordercolor+"; border-radius: " + borderradius + "px; background-color: "+(this.bgcolor.replace(")",","+this.transparency+")")).replace('rgb','rgba')+"; color: "+this.textcolor;
    }
    else {
      this.window.style="border-radius: 12px; background-color: "+(this.bgcolor.replace(")",","+this.transparency+")")).replace('rgb','rgba')+"; color: "+this.textcolor;
    }
    this._separatorArea.height=5*this.zoom;

    for(let f=0;f<this.no;f++) {
      this.labels[f].style='text-align : center;font-size: '+BBCWX_TEXT_SIZE*this.zoom+"px";
      this.fwicons[f].height=BBCWX_ICON_HEIGHT*this.zoom;this.fwicons[f].width= BBCWX_ICON_HEIGHT*this.iconprops.aspect*this.zoom;
      if(this.max[f]) this.max[f].style= 'text-align : center; font-size: '+BBCWX_TEXT_SIZE*this.zoom+"px";
      if(this.min[f]) this.min[f].style= 'text-align : center; font-size: '+BBCWX_TEXT_SIZE*this.zoom+"px";
      if(this.winds[f]) this.winds[f].style= 'text-align : center; font-size: '+BBCWX_TEXT_SIZE*this.zoom+"px";
      if(this.windd[f]) this.windd[f].style= 'text-align : center; font-size: '+BBCWX_TEXT_SIZE*this.zoom+"px";
      if(this.fpressure[f]) this.fpressure[f].style= 'text-align : center; font-size: '+BBCWX_TEXT_SIZE*this.zoom+"px";
      if(this.fhumidity[f]) this.fhumidity[f].style= 'text-align : center; font-size: '+BBCWX_TEXT_SIZE*this.zoom+"px";
    }
    
    this.buttons.style="padding-top:"+BBCWX_BUTTON_PADDING*this.zoom+"px;padding-bottom:"+BBCWX_BUTTON_PADDING*this.zoom+"px";
    
    this.iconbutton.icon_size=BBCWX_REFRESH_ICON_SIZE*this.zoom;
    this.banner.style='font-size: '+BBCWX_LINK_TEXT_SIZE*this.zoom+"px; color: " + this.textcolor;
    this.bannerpre.style='font-size: '+BBCWX_LINK_TEXT_SIZE*this.zoom+"px; color: " + this.textcolor; 
    
    let forecastlabels = ['maxlabel', 'minlabel', 'windlabel', 'winddlabel'];
    for (let i = 0; i<forecastlabels.length; i++) {
      if (this[forecastlabels[i]]) this[forecastlabels[i]].style = 'text-align : right;font-size: '+BBCWX_LABEL_TEXT_SIZE*this.zoom+"px";
    }
    
    this.cweather.style='padding: ' + BBCWX_CONTAINER_PADDING*this.zoom+'px';
    if (this.vertical==1) {
      // loose the top padding on container in vertical mode (too much space)
      this.container.style='padding: 0 ' + BBCWX_CONTAINER_PADDING*this.zoom+'px ' + BBCWX_CONTAINER_PADDING*this.zoom+'px ' + BBCWX_CONTAINER_PADDING*this.zoom+'px ' ;
    } else {
      this.container.style='padding: ' + BBCWX_CONTAINER_PADDING*this.zoom+'px';
    }
    
  },
    
  ////////////////////////////////////////////////////////////////////////////
  // Update the forecast, without changing layout or styling
  updateForecast: function() {
    this._refreshweathers();
  },
  
  ////////////////////////////////////////////////////////////////////////////
  // Change the location we are displaying weather for
  changeStation: function() {
    this.service.setStation(this.stationID);
    this._refreshweathers();
  },
  
  ////////////////////////////////////////////////////////////////////////////
  // Change the API key and reget weather data
  changeApiKey: function() {
    this.service.setApiKey(this.apikey);
    this._refreshweathers();
  },
  
  ////////////////////////////////////////////////////////////////////////////
  // Change the refresh period and restart the loop
  changeRefresh: function() {
    this._setDerivedValues();
    this._doLoop();
  },
  
  ////////////////////////////////////////////////////////////////////////////
  // Called when there is a change to user config for parameters to display
  displayOptsChange: function() {
    this.redrawNeeded = true;
    this.redraw();
  },
  
  ////////////////////////////////////////////////////////////////////////////
  // redraw the window, but without refetching data from the service provider
  redraw: function() {
    this._setDerivedValues();
    this._createWindow(); 
    this._update_style();
    this.displayCurrent();
    this.displayForecast();
    this.displayMeta();
  },
      
  ////////////////////////////////////////////////////////////////////////////
  // update the data from the service and start the timeout to the next update
  // refreshData will call the display* functions
  _refreshweathers: function() {
    let now=new Date().toLocaleFormat('%H:%M:%S');
    global.log("bbcwx (instance " + this.desklet_id + "): refreshing forecast at " + now);
    
    // pass this to refreshData as it needs to call display* functions once the data
    // is updated
    this.service.refreshData(this);  
    
    this._doLoop();
  },
  
  ////////////////////////////////////////////////////////////////////////////
  // Begin / restart the main loop, waiting for refreshSec before updating again  
  _doLoop: function() {
    if(typeof this._timeoutId !== 'undefined') {
      Mainloop.source_remove(this._timeoutId);
    }
    
    this._timeoutId=Mainloop.timeout_add_seconds(Math.round(this.refreshSec * (0.9 + Math.random()*0.2)),Lang.bind(this, this.updateForecast));
  },
  
  ////////////////////////////////////////////////////////////////////////////
  // Update the display of the forecast data
  displayForecast: function() {
    //global.log("bbcwx (instance " + this.desklet_id + "): entering displayForecast");
    for(let f=0;f<this.no;f++)
    {
      let day = this.service.data.days[f];
      this.labels[f].label=((this.daynames[day.day]) ? this.daynames[day.day] : '');
      let fwiconimage = this._getIconImage(day.icon);
      fwiconimage.set_size(BBCWX_ICON_HEIGHT*this.iconprops.aspect*this.zoom, BBCWX_ICON_HEIGHT*this.zoom);
      this.fwicons[f].set_child(fwiconimage);      
      this.wxtooltip[f].set_text(((day.weathertext) ? _(day.weathertext) : _('No data available')));
      if(this.max[f]) this.max[f].text=this._formatTemperature(day.maximum_temperature, true);
      if(this.min[f]) this.min[f].text=this._formatTemperature(day.minimum_temperature, true);
      if(this.winds[f]) this.winds[f].text=this._formatWindspeed(day.wind_speed, true);
      if(this.windd[f]) this.windd[f].text= ((day.wind_direction) ? _(day.wind_direction) : '');   
      if(this.fpressure[f]) this.fpressure[f].text=this._formatPressure(day.pressure, '', true);
      if(this.fhumidity[f]) this.fhumidity[f].text=this._formatHumidity(day.humidity, true);
    }
  },
  
  ////////////////////////////////////////////////////////////////////////////
  // Update the display of the current observations
  displayCurrent: function(){
    let cc = this.service.data.cc;
    if (this.cwicon) {
      let cwimage=this._getIconImage(this.service.data.cc.icon);
      cwimage.set_size(BBCWX_CC_ICON_HEIGHT*this.iconprops.aspect*this.zoom, BBCWX_CC_ICON_HEIGHT*this.zoom);
      this.cwicon.set_child(cwimage);
    }
    if (this.shifttemp) {
      if (this.weathertext) this.weathertext.text = ((cc.weathertext) ? _(cc.weathertext) : '');
      this.currenttemp.text = this._formatTemperature(cc.temperature, true) ;  
    } else {
      if (this.weathertext) this.weathertext.text = ((cc.weathertext) ? _(cc.weathertext) : '') + ((cc.temperature && cc.weathertext) ? ', ' : '' )+ this._formatTemperature(cc.temperature, true) ;
    }
    
    if (this.humidity) this.humidity.text= this._formatHumidity(cc.humidity);
    if (this.pressure) this.pressure.text=this._formatPressure(cc.pressure, cc.pressure_direction, true);
    if (this.windspeed) this.windspeed.text=((cc.wind_direction) ? _(cc.wind_direction) + ", " : '') + this._formatWindspeed(cc.wind_speed, true);      
    if (this.feelslike) this.feelslike.text=this._formatTemperature(cc.feelslike, true);
    if (this.visibility) this.visibility.text=this._formatVisibility(cc.visibility, true);
    if (this.service.data.status.cc != BBCWX_SERVICE_STATUS_OK && this.weathertext) {
      this.weathertext.text = (this.service.data.status.lasterror) ? _('Error: ') + this.service.data.status.lasterror : _('No data') ;
    }
  },
  
  ////////////////////////////////////////////////////////////////////////////
  // Update the display of the meta data, eg city name
  displayMeta: function() {
    let city=this.service.data.city;
    if (this.show.meta.country) {
      city = city + ', ' + this.service.data.country;
    }
    this.cityname.text=city;
    if (this.service.linkIcon) {
      this.banner.label = '';
      let bannericonimage = this._getIconImage(this.service.linkIcon.file);
      bannericonimage.set_size(this.service.linkIcon.width*this.zoom, this.service.linkIcon.height*this.zoom);
      this.banner.set_child(bannericonimage); 
    } else {
      this.banner.label = this.service.linkText;
    }
    this.bannertooltip.set_text(this.service.linkTooltip);
    if (this.cwicontooltip) this.cwicontooltip.set_text(this.service.linkTooltip);
    try {
      if (this.bannersig) this.banner.disconnect(this.bannersig);
      if (this.cwiconsig && this.cwicon) this.cwicon.disconnect(this.cwiconsig);
      this.bannersig = null;
      this.cwiconsig = null;
    } catch(e) { global.logWarning("Failed to disconnect signal from link banner") }  
    this.bannersig = this.banner.connect('clicked', Lang.bind(this, function() {
        Util.spawnCommandLine("xdg-open " + this.service.linkURL );
    }));
    if (this.cwicon) { 
        this.cwiconsig = this.cwicon.connect('clicked', Lang.bind(this, function() {
          Util.spawnCommandLine("xdg-open " + this.service.linkURL );
      }));
    }
    if (this.service.data.status.meta != BBCWX_SERVICE_STATUS_OK) {
      this.cityname.text = (this.service.data.status.lasterror) ? _('Error: ') + this.service.data.status.lasterror : _('No data') ;
    }
  },
  
  ////////////////////////////////////////////////////////////////////////////
  // Get an icon
  _getIconImage: function(iconcode) {
    let icon_name = 'na';
    let icon_ext = '.' + this.iconprops.ext;
    if (iconcode) {
      icon_name = iconcode;
    }
      
    let icon_file = DESKLET_DIR + '/icons/' + this.iconstyle +'/' + icon_name + icon_ext;
    let file = Gio.file_new_for_path(icon_file);
    let icon_uri = file.get_uri();
    
    return St.TextureCache.get_default().load_uri_async(icon_uri, 200*this.zoom, 200*this.zoom);
  },
  
  ////////////////////////////////////////////////////////////////////////////
  // take a temperature in C and convert as needed. 
  // Append unit string if units is true
  _formatTemperature: function(temp, units) {
    units = typeof units !== 'undefined' ? units : false;
    if (typeof temp === 'undefined') return '';
    if (!temp.toString().length) return ''; 
    let celsius = 1*temp;
    let fahr = ((celsius + 40) * 1.8) - 40;
    let out = Math.round(((this.units==1) ? celsius : fahr));
    if (units) {
      out += ((this.units==1) ? _("\u2103") : _("\u2109"))
    }
    return out;
  },

  ////////////////////////////////////////////////////////////////////////////
  // take a wind speed in km/h and convert to required 
  // units. Append unit string if units is true
  _formatWindspeed: function(wind, units) {
    units = typeof units !== 'undefined' ? units : false;
    if (typeof wind === 'undefined') return '';
    if (!wind.toString().length) return '';
    let conversion = {
      'mph': 0.621,
      'knots': 0.54,
      'kph': 1,
      'mps': 0.278
    };
    let unitstring = {
      'mph': _('mph'),
      'knots': _('kn'),
      'kph': _('km/h'),
      'mps': _('m/s')
    }
    let kph = 1*wind;
    let out = kph * conversion[this.wunits];
    out = out.toFixed(0);
    if (units) {
      out += unitstring[this.wunits];
    }
    return out;
  },
  
  ////////////////////////////////////////////////////////////////////////////
  // take a pressure in mb and convert as needed. Append units and trajectory
  // -> pressure: real, pressure (in mb)
  // -> direction: string, direction of travel, or false
  // -> units: boolean, append units
  _formatPressure: function(pressure, direction, units) {
    units = typeof units !== 'undefined' ? units : false;
    direction = typeof direction !== 'undefined' ? direction : '';
    if (typeof pressure === 'undefined') return '';
    if (!pressure.toString().length) return '';
    let conversion = {
      'mb': 1,
      'in': 0.02953,
      'mm': 0.75,
      'kpa': 0.1
    };
    let unitstring = {
      'mb': _('mb'),
      'in': _('in'),
      'mm': _('mm'),
      'kpa': _('kPa')
    };
    let precission = {
      'mb': 0,
      'in': 2,
      'mm': 0,
      'kpa' : 1
    };
    let mb = 1*pressure;
    let out = mb * conversion[this.punits];
    out = out.toFixed(precission[this.punits]);
    if (units) {
      out += unitstring[this.punits];;
    }
    if (direction) {
      out += ', ' + _(direction);
    }
    return out;
  },
  
  ////////////////////////////////////////////////////////////////////////////
  _formatHumidity: function(humidity) {
    if (!humidity.toString().length) return '';
    let out = 1*humidity
    out = out.toFixed(0)
    return out + '%';
  },

  ////////////////////////////////////////////////////////////////////////////
  // take a visibility and converts to the required format. Strings are returned
  // as such, numbers (assumed km) are converted. Append unit string if units is true
  _formatVisibility: function(vis, units) {
    units = typeof units !== 'undefined' ? units : false;
    if (typeof vis === 'undefined') return '';
    if (!vis.toString().length) return '';
    if (isNaN(vis)) return _(vis);
    // we infer the desired units from windspeed units
    let conversion = {
      'mph': 0.621,
      'knots': 0.54,
      'kph': 1,
      'mps': 1
    };
    let unitstring = {
      'mph': _('mi'),
      'knots': _('nmi'),
      'kph': _('km'),
      'mps': _('km')
    }
    let km = 1*vis;
    let out = km * conversion[this.wunits];
    let decpl = (out < 4) ? 1 : 0;
    out = out.toFixed(decpl);
    if (units) {
      out += unitstring[this.wunits];
    }
    return out;
  },
  
  ////////////////////////////////////////////////////////////////////////////
  on_desklet_removed: function() {
    if(typeof this._timeoutId !== 'undefined') {
      Mainloop.source_remove(this._timeoutId);
    }
  }
  
    
};

////////////////////////////////////////////////////////////////////////////
//          ### DRIVERS FOR ACCESSING DIFFERENT WEBSERVICES ###
////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////
// a base driver class. This is overridden by drivers that actually do the work
function wxDriver(stationID, apikey) {
  this._init(stationID, apikey);
};

wxDriver.prototype = {
  // name of the driver
  drivertype: 'Base',
  // URL for credit link
  linkURL: '',
  // text for credit link
  linkText: '',
  // tooltip for credit link
  linkTooltip: 'Click for more information',
  lttTemplate: _('Click for the full forecast for %s'),
  linkIcon: false,
  // the maximum number of days of forecast supported 
  // by this driver
  maxDays : 1,
  // API key for use in some services
  apikey: '',
  
  // minimum allowed interval between refreshes: refer to each service's
  // terms of service when setting specific values
  minTTL: 600,
  
  ////////////////////////////////////////////////////////////////////////////
  // initialise
  _init: function(stationID, apikey) {
    apikey = (typeof apikey !== 'undefined') ? apikey : '';
    this.stationID = stationID;
    this.apikey = apikey;
    
    // a list of capabilities supported by the driver
    // we set them all to true here and expect any children
    // to disable those they don't support
    this.capabilities = {
      cc: {
        humidity: true,
        temperature: true,
        pressure: true,
        pressure_direction: true,
        wind_speed: true,
        wind_direction: true,
        obstime: true,
        weathertext: true,
        visibility: true,
        feelslike: true
      },
      forecast: {
        humidity: true,
        maximum_temperature: true,
        minimum_temperature: true,
        pressure: true,
        pressure_direction: true,
        wind_speed: true,
        wind_direction: true,
        weathertext: true,
        visibility: true,
        uv_risk: true
      },
      meta: {
        city: true,
        country: true,
        region: true
      }
    };
    // ### TODO: if we later use visibility, we need to indicate if driver returns
    // a value (in km) or a descriptive string (good/fair/poor - BBC)
    
    this.data=new Object();
    this._emptyData();
  },
  
  ////////////////////////////////////////////////////////////////////////////
  // create an empty data structure to be filled in by child drivers
  // numeric data returned should be values without units appended. The following units
  // should be used
  // Distance: km
  // Speed: km/h
  // Temperature: C
  // Pressure: mb / HPa
  // Visibility may be expressed either as a number of km or a descriptive string
  // Wind direction should be a 16 point compass bearing, eg SSW
  // Day names should be English three letter abbreviations, eg Mon, Tue
  _emptyData: function() {
    this.data.city = '';
    this.data.country = '';
    this.data.days=[];
    
    // the status of the service request
    delete this.data.status;
    this.data.status = new Object();
    // 1: waiting; 2: success; 0; failed/error
    this.data.status.cc = BBCWX_SERVICE_STATUS_INIT;
    this.data.status.forecast = BBCWX_SERVICE_STATUS_INIT;
    this.data.status.meta = BBCWX_SERVICE_STATUS_INIT;
    this.data.status.lasterror = false;
    
    // current conditions
    delete this.data.cc;
    this.data.cc = new Object();
    this.data.cc.wind_direction = '';
    this.data.cc.wind_speed = '';
    this.data.cc.pressure = '';
    this.data.cc.pressure_direction = '';
    this.data.cc.temperature = '';
    this.data.cc.humidity = '';
    this.data.cc.visibility = '';
    this.data.cc.obstime = '';
    this.data.cc.weathertext = '';
    this.data.cc.icon = '';
    this.data.cc.feelslike = '';
    
    // forecast
    for(let i=0; i<this.maxDays; i++) {
      let day = new Object();
      day.day = '';
      day.weathertext = '';
      day.icon = '';
      day.maximum_temperature ='';
      day.minimum_temperature = '';
      day.wind_direction = '';
      day.wind_speed = '';
      day.visibility = '';
      day.pressure = '';
      day.humidity = '';
      day.uv_risk = '';
      day.pollution = '';
      day.sunrise = '';
      day.sunset = '';
      delete this.data.days[i];
      this.data.days[i] = day;
    };
  },
  
  ////////////////////////////////////////////////////////////////////////////
  // change the stationID
  setStation: function(stationID) {
    this.stationID = stationID;
  },

  ////////////////////////////////////////////////////////////////////////////
  // change the apikey
  setApiKey: function(apikey) {
    this.apikey = apikey;
  },
  
  ////////////////////////////////////////////////////////////////////////////
  // for debugging. Log the driver type
  showType: function() {
    global.log('Using driver type: ' + this.drivertype);
  },
  
  ////////////////////////////////////////////////////////////////////////////
  // async call to retrieve the data. 
  // -> url: url to call
  // -> callback: callback function to which the retrieved data is passed
  _getWeather: function(url, callback) {
    var here = this;
    let message = Soup.Message.new('GET', url);
    _httpSession.queue_message(message, function (session, message) {
      if( message.status_code == 200) {
        try {callback.call(here,message.response_body.data.toString());} catch(e) {global.logError(e)}
      } else {
        global.logWarning("Error retrieving address " + url + ". Status: " + message.status_code);
        here.data.status.lasterror = message.status_code;
        callback.call(here,false);
      }
    });
  }, 

  // stub function to be overridden by child classes. deskletObj is a reference
  // to the main object. It is passed to allow deskletObj.displayForecast()
  // deskletObj.displayMeta() and deskletObj.displayCurrent() to be called from
  // within callback functions.
  refreshData: function(deskletObj) {
  },

  ////////////////////////////////////////////////////////////////////////////
  // Utility function to translate direction in degrees into 16 compass points
  compassDirection: function(deg) {
    let directions = ['N', 'NNE','NE', 'ENE','E', 'ESE','SE','SSE', 'S','SSW', 'SW', 'WSW','W','WNW', 'NW','NNW'];
    return directions[Math.round(deg / 22.5) % directions.length];
  }


};

////////////////////////////////////////////////////////////////////////////
// ### Driver for the BBC
function wxDriverBBC(stationID) {
  this._bbcinit(stationID);
};

wxDriverBBC.prototype = {
  __proto__: wxDriver.prototype,
  
  drivertype: 'BBC',
  maxDays: 3, 
  linkText: 'www.bbc.co.uk/weather',
  
  // these will be dynamically reset when data is loaded
  linkURL: 'http://www.bbc.co.uk/weather/',
  linkTooltip: 'Visit the BBC weather website',
  
  _baseURL: 'http://open.live.bbc.co.uk/weather/feeds/en/',
  
  // initialise the driver
  _bbcinit: function(stationID) {
    this._init(stationID);
    this.capabilities.meta.region =  false;
    this.capabilities.cc.feelslike = false;
    this.capabilities.cc.obstime = false;
  },
  
  refreshData: function(deskletObj) {
    // reset the data object
    this._emptyData();
    this.linkTooltip = 'Visit the BBC weather website';
    this.linkURL = 'http://www.bbc.co.uk/weather';
    
    // process the three day forecast
    let a = this._getWeather(this._baseURL + this.stationID + '/' + '3dayforecast' + '.rss', function(weather) {
      if (weather) {
        this._load_forecast(weather);
      }
      // get the main object to update the display
      deskletObj.displayForecast();
      deskletObj.displayMeta();
    });

    // process current observations
    let b = this._getWeather(this._baseURL + this.stationID + '/' + 'observations' + '.rss', function(weather) {
      if (weather) {
        this._load_observations(weather); 
      }
      // get the main object to update the display
      deskletObj.displayCurrent();      
    });    
    
  },
  
  // process the rss for a 3dayforecast and populate this.data
  _load_forecast: function (rss) {
    if (!rss) {
      this.data.status.forecast = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
      return;
    }
    let days = [];
    
    let parser = new marknote.Parser();
    let doc = parser.parse(rss);
    if (!doc)  {
      this.data.status.forecast = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
      return;
    }
    try {
      let rootElem = doc.getRootElement();
      let channel = rootElem.getChildElement("channel");
      let location = channel.getChildElement("title").getText().split("Forecast for")[1].trim();
      this.data.city = location.split(',')[0].trim();
      this.data.country = location.split(',')[1].trim();
      this.linkTooltip = this.lttTemplate.replace('%s', this.data.city);
      this.linkURL = channel.getChildElement("link").getText();
      let items = channel.getChildElements("item");
      let desc, title;

      for (let i=0; i<items.length; i++) {
        let data = new Object();
        desc = items[i].getChildElement("description").getText();
        title = items[i].getChildElement("title").getText();
        data.link = items[i].getChildElement("link").getText();
        data.day = title.split(':')[0].trim().substring(0,3);
        data.weathertext = title.split(':')[1].split(',')[0].trim();
        let parts = desc.split(',');
        let k, v;
        for (let b=0; b<parts.length; b++) {
          k = parts[b].slice(0, parts[b].indexOf(':')).trim().replace(' ', '_').toLowerCase();
          v = parts[b].slice(parts[b].indexOf(':')+1).trim();
          if (v.substr(0,4).toLowerCase() == 'null') v = '';
          if (k == "wind_direction" && v != '') {
            let vparts = v.split(" ");
            v = '';
            for (let c=0; c<vparts.length; c++) {
              v += vparts[c].charAt(0).toUpperCase();
            }
          }
          data[k] = v;
        }
        data.maximum_temperature = this._getTemperature(data.maximum_temperature);
        data.minimum_temperature = this._getTemperature(data.minimum_temperature);
        data.wind_speed = this._getWindspeed(data.wind_speed);
        data.pressure = data.pressure.replace('mb', '');
        data.humidity = data.humidity.replace('%', '');
        data.icon = this._getIconFromText(data.weathertext);
        this.data.days[i] = data;
      }
      this.data.status.forecast = BBCWX_SERVICE_STATUS_OK;
      this.data.status.meta = BBCWX_SERVICE_STATUS_OK;
    } catch(e) {
      global.logError(e);
      this.data.status.forecast = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
    }
  },

  // take an rss feed of current observations and extract data into this.data
  _load_observations: function (rss) {
    if (!rss) {
      this.data.status.cc = BBCWX_SERVICE_STATUS_ERROR;
      return;
    }
    let parser = new marknote.Parser();
    let doc = parser.parse(rss);
    if (!doc) {
      this.data.status.cc = BBCWX_SERVICE_STATUS_ERROR;
      return;
    }
    try {
      let rootElem = doc.getRootElement();
      let channel = rootElem.getChildElement("channel");
      let item = channel.getChildElement("item");
      let desc = item.getChildElement("description").getText();
      let title = item.getChildElement("title").getText();
      desc = desc.replace('mb,', 'mb|');
      this.data.cc.weathertext = title.split(':')[2].split(',')[0].trim();
      if (this.data.cc.weathertext.toLowerCase() == 'null') this.data.cc.weathertext = '';
      let parts = desc.split(',');
      for (let b=0; b<parts.length; b++) {
        let k, v;
        k = parts[b].slice(0, parts[b].indexOf(':')).trim().replace(' ', '_').toLowerCase();
        v = parts[b].slice(parts[b].indexOf(':')+1).trim();
        if (v.substr(0,4).toLowerCase() == 'null') v = '';
        if (k == 'wind_direction' && v != '') {
          let vparts = v.split(" ");
          v = '';
          for (let c=0; c<vparts.length; c++) {
            v += vparts[c].charAt(0).toUpperCase();
          }
        }
        if (k == 'pressure' && v != '') {
          let pparts=v.split('|');
          v = pparts[0].trim();
          this.data.cc.pressure_direction = pparts[1].trim();
        }      
        this.data.cc[k] = v;
      }
      this.data.cc.icon = this._getIconFromText(this.data.cc.weathertext);
      this.data.cc.temperature = this._getTemperature(this.data.cc.temperature);
      this.data.cc.wind_speed = this._getWindspeed(this.data.cc.wind_speed);
      this.data.cc.humidity = this.data.cc.humidity.replace('%', '');
      this.data.cc.pressure = this.data.cc.pressure.replace('mb', '');
      this.data.status.cc = BBCWX_SERVICE_STATUS_OK;
    } catch(e) {
      global.logError(e);
      this.data.status.cc = BBCWX_SERVICE_STATUS_ERROR;
    }
  },
  
  _getIconFromText: function(wxtext) {
    let icon_name = 'na';
    let iconmap = {
      'clear sky' : '31', //night
      'sunny' : '32',
      'partly cloudy' : '29',  //night
      'sunny intervals' : '30',
      'sand storm' : '19', // not confirmed
      'mist' : '20',
      'fog' : '20',
      'white cloud' : '26',
      'light cloud' : '26',
      'grey cloud' : '26d',
      'thick cloud' : '26d',
      'light rain shower' : '39',
      'drizzle' : '9',
      'light rain' : '11',
      'heavy rain shower' : '39',
      'heavy rain' : '12',
      'sleet shower' : '07',
      'sleet' : '07',
      'light snow shower' : '41',
      'light snow' : '13',
      'heavy snow shower' : '41',
      'heavy snow' : '16',
      'thundery shower' : '37',
      'thunder storm' : '04',
      'thunderstorm' : '04',
      'hazy' : '22'
    }
    if (wxtext) {
      wxtext = wxtext.toLowerCase();
      if (typeof iconmap[wxtext] !== "undefined") {
        icon_name = iconmap[wxtext];
      }
    }
    return icon_name;
  },
  
  _getTemperature: function(temp) {
    if (!temp) return ''; 
    let celsius = temp.slice(0, temp.indexOf('C')-1).trim();
    return celsius;
  },
  
  _getWindspeed: function(wind) {
    if (!wind) return '';
    let mph = wind.replace('mph', '');
    let out = mph * 1.6;
    return out;
  },

  _getPressure: function(pressure) {
    if (!pressure) return '';
    let parts = pressure.split(', ');
    let number = parts[0].trim().replace('mb', '');
    let trajectory = parts[1].trim();
    out = number;
    if (units) {
      out += _('mb');
    }
    out += ', ' + _(trajectory);
    return out;
  },

};  

////////////////////////////////////////////////////////////////////////////
// ### Driver for Yahoo! Weather
function wxDriverYahoo(stationID) {
  this._yahooinit(stationID);
};

wxDriverYahoo.prototype = {
  __proto__: wxDriver.prototype,
  
  drivertype: 'Yahoo',
  maxDays: 5, 
  linkText: 'Yahoo! Weather',
  
  // these will be dynamically reset when data is loaded
  linkURL: 'http://weather.yahoo.com',
  linkTooltip: 'Visit the Yahoo! Weather website',
  
  _baseURL: 'http://weather.yahooapis.com/forecastrss?u=c&w=',
  
  // initialise the driver
  _yahooinit: function(stationID) {
    this._init(stationID);
    this.capabilities.forecast.wind_direction =  false;
    this.capabilities.forecast.wind_speed =  false;
    this.capabilities.forecast.pressure =  false;
    this.capabilities.forecast.pressure_direction =  false;
    this.capabilities.forecast.visibility =  false;
    this.capabilities.forecast.uv_risk =  false;
    this.capabilities.forecast.humidity =  false;  
    this.capabilities.cc.visibility = false;
    this._woeidcache = new Object();
  },
  
  // for the yahoo driver, this is a wrapper around _refreshData. This is needed in order
  // to get the yahoo WOEID if this.stationID has been provided as lat,lon
  refreshData: function(deskletObj) {
    // reset the data object
    this._emptyData();
    this.linkTooltip = 'Visit the Yahoo! Weather website';
    this.linkURL = 'http://weather.yahoo.com/';
    
    // lat,lon location
    if (this.stationID.search(/^\-?\d+(\.\d+)?,\-?\d+(\.\d+)?$/) == 0) {
      if (typeof this._woeidcache[this.stationID] === 'object') {
        //global.log ("bbcwx: woeidcache hit for " + this.stationID + ": " + this._woeidcache[this.stationID].woeid);
        this._woeid = this._woeidcache[this.stationID].woeid;
        this._refreshData(deskletObj);
      } else {
        // look up the WOEID from geo.placefinder YQL table. Async lookup with _refreshData
        // in call back to ensure WOEID is available before it is called
        let latlon = this.stationID.split(',')
        let geourl = 'http://query.yahooapis.com/v1/public/yql?q=select%20*%20from%20geo.placefinder%20where%20text%3D%22' + latlon[0] + '%2C' + latlon[1] +'%22%20and%20gflags%3D%22R%22&format=json&callback=';
        let a = this._getWeather(geourl, function(geo) {
          if (geo) {
            let ok = this._load_woeid(geo);
            if (ok) { 
              this._refreshData(deskletObj);
            } else {
              deskletObj.displayCurrent();  
              deskletObj.displayMeta();
              deskletObj.displayForecast();             
            }
          } else {
            this.data.status.forecast = BBCWX_SERVICE_STATUS_ERROR;
            this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
            this.data.status.cc = BBCWX_SERVICE_STATUS_ERROR;
            this.data.status.lasterror = "Could not resolve location";
            deskletObj.displayCurrent();  
            deskletObj.displayMeta();
            deskletObj.displayForecast();
          }
        });   
      }
    // unrecognised - not a numeric WOEID
    } else if (this.stationID.search(/^\d+$/) !=0) {
      this.data.status.forecast = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.cc = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.lasterror = "Invalid location format";
      deskletObj.displayForecast();
      deskletObj.displayMeta();     
      deskletObj.displayCurrent();
      return;
    // looks like a WOEID
    } else {
      this._woeid = this.stationID;
      this._refreshData(deskletObj);
    }
    
  },
  
  _refreshData: function(deskletObj) {
    // get the forecast
    let a = this._getWeather(this._baseURL + encodeURIComponent(this._woeid), function(weather) {
      if (weather) {
        this._load_forecast(weather);
      }
      // get the main object to update the display
      deskletObj.displayCurrent();  
      deskletObj.displayMeta();
      deskletObj.displayForecast();
    });       
  },
  
  _load_woeid: function(data) {
    if (!data) {
      this.data.status.forecast = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.cc = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.lasterror = "Could not resolve location";
      return false;
    }    
   
    let json = JSON.parse(data);
    this._woeidcache[this.stationID] = new Object();
    
    try {
      let geo = json.query.results.Result;
      if (geo.woeid) {
        this._woeid = geo.woeid;
        this._woeidcache[this.stationID].woeid = geo.woeid;
        return true;
      } else {
        this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
        this.data.status.forecast = BBCWX_SERVICE_STATUS_ERROR;
        this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
        this.data.status.cc = BBCWX_SERVICE_STATUS_ERROR;
        this.data.status.lasterror = "Could not resolve location";
        return false;        
      }
    } catch(e) {
      global.logError(e);
      delete this._woeidcache[this.stationID]
      this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.forecast = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.cc = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.lasterror = "Could not resolve location";
      return false;
    }   
  },
  
  // process the rss and populate this.data
  _load_forecast: function (rss) {
    if (!rss) {
      this.data.status.forecast = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.cc = BBCWX_SERVICE_STATUS_ERROR;
      return;
    }    
    let days = [];
    
    let parser = new marknote.Parser();
    let doc = parser.parse(rss);
    if (!doc) {
      this.data.status.cc = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.forecast = BBCWX_SERVICE_STATUS_ERROR;
      return;
    }
    try {
      let rootElem = doc.getRootElement();

      let channel = rootElem.getChildElement("channel");
      let title = channel.getChildElement("title").getText();
      if (title.indexOf('Error') != -1) {
        this.data.status.cc = BBCWX_SERVICE_STATUS_ERROR;
        this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
        this.data.status.forecast = BBCWX_SERVICE_STATUS_ERROR;
        let items = channel.getChildElements("item");
        this.data.status.lasterror = items[0].getChildElement("title").getText();
        return;
      }
      
      let geo = channel.getChildElement('yweather:location');
      let wind = channel.getChildElement('yweather:wind');
      let atmosphere = channel.getChildElement('yweather:atmosphere');


      let pressurecodes = ['Steady', 'Rising', 'Falling'];

      this.data.city = geo.getAttributeValue('city');
      this.data.region = geo.getAttributeValue('region');
      this.data.country = geo.getAttributeValue('country');


      this.data.cc.wind_speed = wind.getAttributeValue('speed');
      this.data.cc.wind_direction = this.compassDirection(wind.getAttributeValue('direction'));
      this.data.cc.pressure = atmosphere.getAttributeValue('pressure');
      this.data.cc.pressure_direction = pressurecodes[atmosphere.getAttributeValue('rising')];
      this.data.cc.humidity = atmosphere.getAttributeValue('humidity');


      let items = channel.getChildElements("item");
      let conditions = items[0].getChildElement('yweather:condition');

      this.data.cc.temperature = conditions.getAttributeValue('temp');
      this.data.cc.obstime = conditions.getAttributeValue('date');
      this.data.cc.weathertext = conditions.getAttributeValue('text');
      this.data.cc.icon = this._mapicon(conditions.getAttributeValue('code'));
      this.data.cc.feelslike = wind.getAttributeValue('chill');
      
      this.linkURL = items[0].getChildElement('link').getText();
      this.linkTooltip = this.lttTemplate.replace('%s', this.data.city);

      let forecasts = items[0].getChildElements('yweather:forecast');

      for ( let i=0; i<forecasts.length; i++) {
        let day = new Object();
        day.day = forecasts[i].getAttributeValue('day');
        day.maximum_temperature = forecasts[i].getAttributeValue('high');
        day.minimum_temperature = forecasts[i].getAttributeValue('low');
        day.weathertext = forecasts[i].getAttributeValue('text');
        day.icon = this._mapicon(forecasts[i].getAttributeValue('code'));
        this.data.days[i] = day;
      }
      
      this.data.status.forecast = BBCWX_SERVICE_STATUS_OK;
      this.data.status.meta = BBCWX_SERVICE_STATUS_OK;
      this.data.status.cc = BBCWX_SERVICE_STATUS_OK;
    } catch(e) {
      global.logError(e);
      this.data.status.forecast = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.cc = BBCWX_SERVICE_STATUS_ERROR;
    }
  },
  
  _mapicon: function(code) {
    // http://developer.yahoo.com/weather/#codes
    let icon_name = 'na';
    let iconmap = {
      '0' : '00',
      '1' : '01',
      '2' : '01',
      '3' : '03',
      '4' : '04',
      '5' : '05',
      '6' : '06',
      '7' : '07',
      '8' : '08',
      '9' : '09',
      '10' : '10',
      '11' : '11',
      '12' : '12',
      '13' : '13',
      '14' : '41',
      '15' : '15',
      '16' : '16',
      '17' : '18',
      '18' : '18',
      '19' : '19',
      '20' : '20',
      '21' : '22',
      '22' : '22',
      '23' : '23',
      '24' : '24',
      '25' : '25',
      '26' : '26',
      '27' : '27',
      '28' : '28',
      '29' : '29',
      '30' : '30',
      '31' : '31',
      '32' : '32',
      '33' : '33',
      '34' : '34',
      '35' : '06',
      '36' : '36',
      '37' : '37',
      '38' : '38',
      '39' : '39', // this actually seems to map to showers, see  http://developer.yahoo.com/forum/YDN-Documentation/Yahoo-Weather-API-Wrong-Condition-Code/1290534174000-1122fc3d-da6d-34a2-9fb9-d0863e6c5bc6
      '40' : '39',
      '41' : '16',
      '42' : '41',
      '43' : '16',
      '44' : '30',
      '45' : '47',
      '46' : '46',
      '47' : '47',
      '3200' : 'na'
    }
    if (code && (typeof iconmap[code] !== "undefined")) {
      icon_name = iconmap[code];
    }
    // ### TODO consider some text based overides, eg
    // /light rain/i    11
    
    return icon_name;
  },
  
};  

////////////////////////////////////////////////////////////////////////////
// ### Driver for Open Weather Map
function wxDriverOWM(stationID, apikey) {
  this._owminit(stationID, apikey);
};

wxDriverOWM.prototype = {
  __proto__: wxDriver.prototype,
  
  drivertype: 'OWM',
  maxDays: 7, 
  linkText: 'openweathermap.org',
  
  // these will be dynamically reset when data is loaded
  linkURL: 'http://openweathermap.org',
  linkTooltip: 'Visit the Open Weather Map website',
  
  _baseURL: 'http://api.openweathermap.org/data/2.5/',
  
  // initialise the driver
  _owminit: function(stationID, apikey) {
    this._init(stationID, apikey);
    this.capabilities.meta.region =  false;
    this.capabilities.cc.feelslike = false;
    this.capabilities.cc.pressure_direction = false;
    this.capabilities.cc.visibility = false;
    this.capabilities.forecast.visibility = false;
    this.capabilities.forecast.uv_risk = false;
  },
  
  refreshData: function(deskletObj) {
    // reset the data object
    this._emptyData();
    this.linkTooltip = 'Visit the Open Weather Map website';
    this.linkURL = 'http://openweathermap.org';

    if (this.stationID.search(/^\-?\d+(\.\d+)?,\-?\d+(\.\d+)?$/) == 0) {
      var latlon = this.stationID.split(',');
    } else if (this.stationID.search(/^\d+$/) !=0) {
      this.data.status.forecast = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.cc = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.lasterror = "Invalid location format";
      deskletObj.displayForecast();
      deskletObj.displayMeta();     
      deskletObj.displayCurrent();
      return
    }
    
    // process the 7 day forecast
    let apiforecasturl = (typeof latlon != 'undefined')
      ? this._baseURL + 'forecast/daily?units=metric&cnt=7&lat=' + latlon[0] +  '&lon=' + latlon[1]
      : this._baseURL + 'forecast/daily?units=metric&cnt=7&id=' + encodeURIComponent(this.stationID)

    if (this.apikey) apiforecasturl = apiforecasturl + '&APPID=' + this.apikey;
    let a = this._getWeather(apiforecasturl, function(weather) {
      if (weather) {
        this._load_forecast(weather);
      }
      // get the main object to update the display
      deskletObj.displayForecast();
      deskletObj.displayMeta();
    });

    // process current observations
    let apiccurl = (typeof latlon != 'undefined')  
    ? this._baseURL + 'weather?units=metric&lat=' + latlon[0] +  '&lon=' + latlon[1]
    : this._baseURL + 'weather?units=metric&id=' + encodeURIComponent(this.stationID);
    if (this.apikey) apiccurl = apiccurl + '&APPID=' + this.apikey;
    let b = this._getWeather(apiccurl, function(weather) {
      if (weather) {
        this._load_observations(weather); 
      }
      // get the main object to update the display
      deskletObj.displayCurrent();      
    });    
    
  },
  
  // process the data for a forecast and populate this.data
  _load_forecast: function (data) {
    if (!data) {
      this.data.status.forecast = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
      return;
    }    
   
    let json = JSON.parse(data);
    if (json.cod != '200') {
      this.data.status.forecast = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;    
      this.data.status.lasterror = json.cod;
      return;
    }

    try {
      this.data.city = json.city.name;
      this.data.country = json.city.country;
      this.linkURL = 'http://openweathermap.org/city/' + json.city.id;
      this.linkTooltip = this.lttTemplate.replace('%s', this.data.city);

      for (let i=0; i<json.list.length; i++) {
        let day = new Object();
        day.day = new Date(json.list[i].dt *1000).toLocaleFormat( "%a" );
        day.minimum_temperature = json.list[i].temp.min;
        day.maximum_temperature = json.list[i].temp.max;
        day.pressure = json.list[i].pressure;
        day.humidity = json.list[i].humidity;
        day.wind_speed = json.list[i].speed * 3.6;
        day.wind_direction = this.compassDirection(json.list[i].deg);
        day.weathertext = json.list[i].weather[0].description.ucwords();
        day.icon = this._mapicon(json.list[i].weather[0].icon, json.list[i].weather[0].id);

        this.data.days[i] = day;
      }    
      
      this.data.status.forecast = BBCWX_SERVICE_STATUS_OK;
      this.data.status.meta = BBCWX_SERVICE_STATUS_OK;
    } catch(e) {
      global.logError(e);
      this.data.status.forecast = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;     
    }
  },

  // take the current observations and extract data into this.data
  _load_observations: function (data) {
    if (!data) {
      this.data.status.cc = BBCWX_SERVICE_STATUS_ERROR;
      return;
    }     
    let json = JSON.parse(data);
    if (json.cod != '200') {
      this.data.status.cc = BBCWX_SERVICE_STATUS_ERROR;    
      this.data.status.lasterror = json.cod;
      return;
    }
    
    try {
      this.data.cc.humidity = json.main.humidity;
      this.data.cc.temperature = json.main.temp;
      this.data.cc.pressure = json.main.pressure;
      this.data.cc.wind_speed = json.wind.speed * 3.6;
      this.data.cc.wind_direction = this.compassDirection(json.wind.deg);
      this.data.cc.obstime = new Date(json.dt *1000).toLocaleFormat("%H:%M %Z");
      this.data.cc.weathertext = json.weather[0].description.ucwords();
      this.data.cc.icon = this._mapicon(json.weather[0].icon, json.weather[0].id);
      this.data.status.cc = BBCWX_SERVICE_STATUS_OK; 
    } catch(e) {
      global.logError(e);
      this.data.status.cc = BBCWX_SERVICE_STATUS_ERROR;      
    }
  },
  
  _mapicon: function(iconcode, wxcode) {
    // http://bugs.openweathermap.org/projects/api/wiki/Weather_Condition_Codes
    let icon_name = 'na';
    let wxmap = {
      '300' : '09',
      '301' : '09',
      '302' : '11',
      '310' : '09',
      '311' : '09',
      '312' : '11',
      '313' : '39',
      '314' : '39',
      '321' : '39',
      '500' : '11',
      '511' : '10',
      '521' : '39',
      '522' : '39',
      '531' : '39',
      '600' : '13',
      '601' : '14',
      '602' : '16',
      '611' : '18',
      '612' : '06',
      '615' : '05',
      '616' : '05',
      '620' : '41',
      '621' : '41',
      '622' : '41',
      '721' : '22',
      '731' : '19',
      '751' : '19',
      '761' : '19',
      '762' : '19',
      '771' : '23',
      '781' : '00',
      '802' : '30',
      '803' : '28',
      '804' : '26',
      '900' : '00',
      '901' : '01',
      '902' : '01',
      '903' : '25',
      '904' : '36',
      '905' : '24',
    };
    let nightmap = {
      '39' : '45',
      '41' : '46',
      '30' : '29',
      '28' : '27',
      '32' : '31',
      '22' : '21',
      '47' : '38'
    };
    let iconmap = {
      '01d' : '32',
      '01n' : '31',
      '02d' : '34',
      '02n' : '33',
      '03d' : '26',
      '03n' : '26',
      '04d' : '28',
      '04n' : '27',
      '09d' : '39',
      '09n' : '45',
      '10d' : '12',
      '10n' : '12',
      '11d' : '04',
      '11n' : '04',
      '13d' : '16',
      '13n' : '16',
      '50d' : '20',
      '50n' : '20'
    };
    if (iconcode && (typeof iconmap[iconcode] !== "undefined")) {
      icon_name = iconmap[iconcode];
    }
    // override with more precise icon from the weather code if
    // we can
    if (wxcode && (typeof wxmap[wxcode] !== "undefined")) {
      icon_name = wxmap[wxcode];
    }
    // override with nighttime icons
    if ((iconcode.charAt(2) == 'n') && (typeof nightmap[icon_name] !== "undefined")) {
      icon_name = nightmap[icon_name];
    }    
    return icon_name;
  }, 

};  

////////////////////////////////////////////////////////////////////////////
// ### Driver for Weather Underground
function wxDriverWU(stationID, apikey) {
  this._wuinit(stationID, apikey);
};

wxDriverWU.prototype = {
  __proto__: wxDriver.prototype,
  
  drivertype: 'Wunderground',
  maxDays: 7, 
  linkText: 'wunderground.com\u00AE',
  
  _referralRef: '?apiref=415600fd47df8d55',
  
  // these will be dynamically reset when data is loaded
  linkURL: 'http://wunderground.com' + this._referralRef,
  linkTooltip: 'Visit the Weather Underground website',
  linkIcon: {
    file: 'wunderground',
    width: 145,
    height: 17,
  },
  
  _baseURL: 'http://api.wunderground.com/api/',
  
  // initialise the driver
  _wuinit: function(stationID, apikey) {
    this._init(stationID, apikey);
    this.capabilities.meta.region =  false;
    this.capabilities.forecast.pressure = false;
    this.capabilities.forecast.pressure_direction =  false;
    this.capabilities.forecast.visibility = false;
    this.capabilities.forecast.uv_risk = false;
  },
  
  refreshData: function(deskletObj) {
    // reset the data object
    this._emptyData();
    this.linkTooltip = 'Visit the Weather Underground website';
    this.linkURL = 'http://wunderground.com' + this._referralRef;
    
    // process the forecast - single call for both current conditions and 10 day forecast
    let a = this._getWeather(this._baseURL + encodeURIComponent(this.apikey) + '/forecast10day/conditions/astronomy/q/' + encodeURIComponent(this.stationID) + '.json', function(weather) {
      if (weather) {
        this._load_forecast(weather);
      }
      // get the main object to update the display
      deskletObj.displayForecast();
      deskletObj.displayCurrent();    
      deskletObj.displayMeta();      
    });

  },
  
  // process the data for a multi day forecast and populate this.data
  _load_forecast: function (data) {
    // global.log("WU: entering _load_forecast");
    if (!data) {
      this.data.status.forecast = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.cc = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
      return;
    }    
   
    let json = JSON.parse(data);
    
    if (typeof json.response.error !== 'undefined') {
      this.data.status.forecast = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.cc = BBCWX_SERVICE_STATUS_ERROR;  
      this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.lasterror = json.response.error.type;
      global.logWarning("Error from wunderground: " + json.response.error.type + ": " + json.response.error.description);
      return;
    }
    
    try {
      var days = json.forecast.simpleforecast.forecastday;

      for (let i=0; i<days.length; i++) {
        let day = new Object();
        day.day = days[i].date.weekday_short;
        day.minimum_temperature = days[i].low.celsius;
        day.maximum_temperature = days[i].high.celsius;
        day.humidity = days[i].avehumidity;
        day.wind_speed = days[i].avewind.kph;
        day.wind_direction = this.compassDirection(days[i].avewind.degrees);
        day.weathertext = days[i].conditions;
        day.icon = this._mapicon(days[i].icon, false);

        this.data.days[i] = day;
      }   
      let co = json.current_observation;
      this.data.cc.humidity = co.relative_humidity.replace('%', '');
      this.data.cc.temperature = co.temp_c;
      this.data.cc.pressure = co.pressure_mb;
      this.data.cc.pressure_direction = this._getPressureTrend(co.pressure_trend);
      this.data.cc.wind_speed = co.wind_kph;
      this.data.cc.wind_direction = this.compassDirection(co.wind_degrees);
      this.data.cc.obstime = new Date(co.local_epoch *1000).toLocaleFormat("%H:%M %Z");
      this.data.cc.weathertext = co.weather;
      this.data.cc.icon = this._mapicon(co.icon, json.moon_phase);
      this.data.cc.feelslike = co.feelslike_c;
      this.data.cc.visibility = co.visibility_km;
      this.data.city = co.display_location.city;
      this.data.country = co.display_location.country;
      this.linkURL = co.forecast_url + this._referralRef;
      this.linkTooltip = this.lttTemplate.replace('%s', this.data.city);
      this.data.status.cc = BBCWX_SERVICE_STATUS_OK; 
      this.data.status.meta = BBCWX_SERVICE_STATUS_OK;
      this.data.status.forecast = BBCWX_SERVICE_STATUS_OK;
    } catch(e) {
      global.logError(e);
      this.data.status.forecast = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.cc = BBCWX_SERVICE_STATUS_ERROR;      
    }      
  },
 
  _getPressureTrend: function (code) {
    let out = '';
    let map = {
      '+': _('Rising'),
      '-': _('Falling'),
      '0': _('Steady')
    };
    if (code && (typeof map[code] !== "undefined")) {
      out = map[code];
    }    
    return out;
  },
  
  _mapicon: function(iconcode, astro) {
    let icon_name = 'na';
    let iconmap = {
    'chanceflurries': '13',
    'chancerain': '39',
    'chancesleet': '18',
    'chancesnow': '41',
    'chancetstorms': '38',
    'clear': '32',
    'cloudy': '26',
    'flurries': '13',
    'fog': '20',
    'hazy': '22',
    'mostlycloudy': '28',
    'mostlysunny': '34',
    'partlycloudy': '30',
    'partlysunny': '30',
    'sleet': '18',
    'rain': '12',
    'snow': '16',
    'sunny': '32',
    'tstorms': '04'
    };
    let nightmap = {
      '39' : '45',
      '41' : '46',
      '30' : '29',
      '28' : '27',
      '32' : '31',
      '22' : '21',
      '47' : '38'
    };
    if (iconcode && (typeof iconmap[iconcode] !== "undefined")) {
      icon_name = iconmap[iconcode];
    } 
    
    // override with nighttime icons
    // this is a crude estimate of whether or not it's night
    // TODO test with high latitudes in Winter / Summer
    if (astro) {
      let sr = new Date();
      let ss = new Date();
      let now = new Date()

      sr.setHours(astro.sunrise.hour,astro.sunrise.minute,0);
      ss.setHours(astro.sunset.hour,astro.sunset.minute,0);
      now.setHours(astro.current_time.hour,astro.current_time.minute,0);
      if ((now < sr) || (now > ss)) {
        if ( typeof nightmap[icon_name] !== "undefined") {
          icon_name = nightmap[icon_name];
        }    
      }
    }
    return icon_name;
  }, 

};  

////////////////////////////////////////////////////////////////////////////
// ### Driver for World Weather Online
function wxDriverWWO(stationID, apikey) {
  this._wwoinit(stationID, apikey);
};

wxDriverWWO.prototype = {
  __proto__: wxDriver.prototype,
  
  drivertype: 'WWO',
  maxDays: 7, 
  linkText: 'World Weather Online',
  
  
  // these will be dynamically reset when data is loaded
  linkURL: 'http://www.worldweatheronline.com',
  linkTooltip: 'Visit the World Weather Online website',

  // see http://developer.worldweatheronline.com/free_api_terms_of_use,
  // point 3
  minTTL: 3600,
  
  _baseURL: 'http://api.worldweatheronline.com/free/v1/',
  
  // initialise the driver
  _wwoinit: function(stationID, apikey) {
    this._init(stationID, apikey);
    this.capabilities.forecast.pressure = false;
    this.capabilities.forecast.pressure_direction =  false;
    this.capabilities.cc.pressure_direction = false;
    this.capabilities.cc.feelslike = false;
    this.capabilities.forecast.visibility = false;
    this.capabilities.forecast.uv_risk = false;
    this.capabilities.forecast.humidity = false;
  },
  
  refreshData: function(deskletObj) {
    // reset the data object
    this._emptyData();
    this.linkTooltip = 'Visit the World Weather Online website';
    this.linkURL = 'http://www.worldweatheronline.com';
    
    // process the forecast
    let a = this._getWeather(this._baseURL + 'weather.ashx?q=' + encodeURIComponent(this.stationID) + '&format=json&extra=localObsTime%2CisDayTime&num_of_days=5&includelocation=yes&key=' + encodeURIComponent(this.apikey), function(weather) {
      if (weather) {
        this._load_forecast(weather);
      }
      // get the main object to update the display
      deskletObj.displayForecast();
      deskletObj.displayCurrent();   
      deskletObj.displayMeta(); 
    });
    
  },
  
  // process the data for a multi day forecast and populate this.data
  _load_forecast: function (data) {
    if (!data) {
      this.data.status.forecast = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.cc = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
      return;
    }    
   
    let json = JSON.parse(data);
    
    if (typeof json.data.error !== 'undefined') {
      this.data.status.forecast = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.cc = BBCWX_SERVICE_STATUS_ERROR;  
      this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.lasterror = json.data.error[0].msg;
      global.logWarning("Error from World Weather Online: " + json.data.error[0].msg);
      return;
    }
    
    try {
      let days = json.data.weather;

      for (let i=0; i<days.length; i++) {
        let day = new Object();
        day.day = new Date(days[i].date).toLocaleFormat("%a");
        day.minimum_temperature = days[i].tempMinC;
        day.maximum_temperature = days[i].tempMaxC;
        //day.pressure = json.list[i].pressure;
        //day.humidity = days[i].avehumidity;
        day.wind_speed = days[i].windspeedKmph;
        day.wind_direction = days[i].winddir16Point;
        day.weathertext = days[i].weatherDesc[0].value;
        day.icon = this._mapicon(days[i].weatherCode, days[i].weatherIconUrl[0].value);

        this.data.days[i] = day;
      }   
      let cc = json.data.current_condition[0];

      this.data.cc.humidity = cc.humidity;
      this.data.cc.temperature = cc.temp_C;
      this.data.cc.pressure = cc.pressure;
      this.data.cc.wind_speed = cc.windspeedKmph;
      this.data.cc.wind_direction = cc.winddir16Point;
      let dt = cc.localObsDateTime.split(/\-|\s/);
      this.data.cc.obstime = new Date(dt.slice(0,3).join('/')+' '+dt[3]).toLocaleFormat("%H:%M %Z");
      this.data.cc.weathertext = cc.weatherDesc[0].value;
      this.data.cc.icon = this._mapicon(cc.weatherCode, cc.weatherIconUrl[0].value);
      // vis is in km
      this.data.cc.visibility = cc.visibility;
      
      let locdata = json.data.nearest_area[0];
      this.data.city = locdata.areaName[0].value;
      this.data.country = locdata.country[0].value;
      this.data.region = locdata.region[0].value;
      // we don't reliably get weatherURL in the response :(
      if (typeof locdata.weatherUrl != 'undefined') {
        this.linkURL = locdata.weatherUrl[0].value;
      } else {
        this.linkURL = 'http://www.worldweatheronline.com/v2/weather.aspx?q=' + encodeURIComponent(this.stationID);
      }
      
      this.linkTooltip = this.lttTemplate.replace('%s', this.data.city);
      this.data.status.meta = BBCWX_SERVICE_STATUS_OK;   
      this.data.status.cc = BBCWX_SERVICE_STATUS_OK; 
      this.data.status.forecast = BBCWX_SERVICE_STATUS_OK;
    } catch(e) {
      global.logError(e);
      this.data.status.forecast = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.cc = BBCWX_SERVICE_STATUS_ERROR;      
    }      
  },
  
  _mapicon: function(iconcode, recommendedIcon) {
    // http://www.worldweatheronline.com/feed/wwoConditionCodes.txt
    let icon_name = 'na';
    let iconmap = {
      '395': '16',
      '392': '13',
      '389': '04',
      '386': '37',
      '377': '18',
      '374': '18',
      '371': '16',
      '368': '13',
      '365': '18',
      '362': '18',
      '359': '39',
      '356': '39',
      '353': '39',
      '350': '18',
      '338': '16',
      '335': '16',
      '332': '14',
      '329': '14',
      '326': '13',
      '323': '13',
      '320': '06',
      '317': '06',
      '314': '10',
      '311': '08',
      '308': '12',
      '305': '12',
      '302': '11',
      '299': '11',
      '296': '09',
      '293': '09',
      '284': '08',
      '281': '08',
      '266': '09',
      '263': '09',
      '260': '20',
      '248': '20',
      '230': '15',
      '227': '15',
      '200': '38',
      '185': '08',
      '182': '06',
      '179': '13',
      '176': '39',
      '143': '20',
      '122': '26',
      '119': '26',
      '116': '30',
      '113': '32'
    };
    let nightmap = {
      '39' : '45',
      '41' : '46',
      '30' : '29',
      '28' : '27',
      '32' : '31',
      '22' : '21',
      '47' : '38'
    };
    
    if (iconcode && (typeof iconmap[iconcode] !== "undefined")) {
      icon_name = iconmap[iconcode];
    }
    // override with nighttime icons
    if ((recommendedIcon.indexOf('night') > -1) && (typeof nightmap[icon_name] !== "undefined")) {
      icon_name = nightmap[icon_name];
    } 
    return icon_name;
  }, 

};  

////////////////////////////////////////////////////////////////////////////
// ### Driver for Forecast.io
function wxDriverForecastIo(stationID, apikey) {
  this._fioinit(stationID, apikey);
};

wxDriverForecastIo.prototype = {
  __proto__: wxDriver.prototype,
  
  drivertype: 'forecast.io',
  maxDays: 7, 
  linkText: 'Forecast.io',
  
  
  // these will be dynamically reset when data is loaded
  linkURL: 'http://forecast.io',
  linkTooltip: 'Visit the Forecast.io website',
  
  _baseURL: 'https://api.forecast.io/forecast/',
  
  // initialise the driver
  _fioinit: function(stationID, apikey) {
    this._init(stationID, apikey);
    this.capabilities.forecast.pressure_direction =  false;
    this.capabilities.cc.pressure_direction =  false;
    this.capabilities.cc.obstime = false;
    //this.capabilities.meta.country = false;
    this._geocache = new Object();
  },
  
  refreshData: function(deskletObj) {
    // reset the data object
    this._emptyData();
    this.linkTooltip = 'Visit the Forecast.io website';
    this.linkURL = 'http://forecast.io';
    
    // check the stationID looks valid before going further
    if (this.stationID.search(/^\-?\d+(\.\d+)?,\-?\d+(\.\d+)?$/) == 0) {
      // process the forecast
      let a = this._getWeather(this._baseURL + encodeURIComponent(this.apikey) + '/' + encodeURIComponent(this.stationID) + '?units=ca&exclude=minutely,hourly,alerts,flags', function(weather) {
        if (weather) {
          this._load_forecast(weather);
        }
        // get the main object to update the display
        deskletObj.displayForecast();
        deskletObj.displayCurrent();   
        //deskletObj.displayMeta(); 
      });
      
      // get geo data
      if (typeof this._geocache[this.stationID] === 'object') {
        //global.log ("bbcwx: geocache hit for " + this.stationID + ": " + this._geocache[this.stationID].city);
        this.data.city = this._geocache[this.stationID].city;
        this.data.country = this._geocache[this.stationID].city;
        this.linkURL = 'http://forecast.io/#/f/' + this.stationID;
        this.linkTooltip = this.lttTemplate.replace('%s', this.data.city);
        this.data.status.meta = BBCWX_SERVICE_STATUS_OK;
        deskletObj.displayMeta();
      } else {
        //global.log ("bbcwx: Looking up city for " + this.stationID);
        let latlon = this.stationID.split(',')
        //let geourl = 'http://api.geonames.org/findNearbyPlaceNameJSON?lat=' + latlon[0] + '&lng=' + latlon[1] + '&username=foo';
        let geourl = 'http://query.yahooapis.com/v1/public/yql?q=select%20*%20from%20geo.placefinder%20where%20text%3D%22' + latlon[0] + '%2C' + latlon[1] +'%22%20and%20gflags%3D%22R%22&format=json&callback=';
        let b = this._getWeather(geourl, function(geo) {
          if (geo) {
            this._load_geo(geo);
          }
          // get the main object to update the display  
          deskletObj.displayMeta(); 
        });

      }
    } else {
      this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.cc = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.forecast = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.lasterror = "Invalid location";
      deskletObj.displayMeta(); 
      deskletObj.displayForecast();
      deskletObj.displayCurrent();
    }
    
  },
  
  // process the data for a multi day forecast and populate this.data
  _load_forecast: function (data) {
    if (!data) {
      this.data.status.forecast = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.cc = BBCWX_SERVICE_STATUS_ERROR;
      //this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
      return;
    }    
   
    let json = JSON.parse(data);
    
    try {
      let days = json.daily.data;

      for (i=0; i<days.length; i++) {
        let day = new Object();
        day.day = new Date(days[i].time * 1000).toLocaleFormat("%a");
        day.minimum_temperature = days[i].temperatureMin;
        day.maximum_temperature = days[i].temperatureMax;
        day.minimum_feelslike = days[i].apparentTemperatureMin;
        day.maximum_feelslike = days[i].apparentTemperatureMax;
        day.pressure = days[i].pressure;
        day.humidity = days[i].humidity*100;
        day.wind_speed = days[i].windSpeed;
        day.wind_direction = this.compassDirection(days[i].windBearing);
        day.weathertext = days[i].summary;
        day.icon = this._mapicon(days[i].icon);
        day.visibility = days[i].visibility;

        this.data.days[i] = day;
      }
      let cc = json.currently;

      this.data.cc.humidity = cc.humidity*100;
      this.data.cc.temperature = cc.temperature;
      this.data.cc.pressure = cc.pressure;
      this.data.cc.wind_speed = cc.windSpeed;
      this.data.cc.wind_direction = this.compassDirection(cc.windBearing);
      this.data.cc.weathertext = cc.summary;
      this.data.cc.icon = this._mapicon(cc.icon);
      this.data.cc.visibility = cc.visibility;
      this.data.cc.feelslike = cc.apparentTemperature;
      
      //this.data.city = json.latitude + ', ' + json.longitude;
      //this.linkURL = 'http://forecast.io/#/f/' + json.latitude + ',' + json.longitude;
      
      //this.linkTooltip = this.lttTemplate.replace('%s', this.data.city);
      //this.data.status.meta = BBCWX_SERVICE_STATUS_OK;   
      this.data.status.cc = BBCWX_SERVICE_STATUS_OK; 
      this.data.status.forecast = BBCWX_SERVICE_STATUS_OK;
    } catch(e) {
      global.logError(e);
      this.data.status.forecast = BBCWX_SERVICE_STATUS_ERROR;
      //this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.cc = BBCWX_SERVICE_STATUS_ERROR;      
    }      
  },
  
  _load_geo: function(data) {
    if (!data) {
      this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
      return;
    }    
   
    let json = JSON.parse(data);
    this._geocache[this.stationID] = new Object();
    
    try {
      let geo = json.query.results.Result;
      this.data.city = geo.city;
      this.data.country = geo.country;
      this._geocache[this.stationID].city = geo.city;
      this._geocache[this.stationID].country = geo.country;
      this.linkURL = 'http://forecast.io/#/f/' + this.stationID;
      this.linkTooltip = this.lttTemplate.replace('%s', this.data.city);
      this.data.status.meta = BBCWX_SERVICE_STATUS_OK;
    } catch(e) {
      global.logError(e);
      delete this._geocache[this.stationID]
      this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
    }
  },
  
  _mapicon: function(iconcode) {
    // https://developer.forecast.io/docs/v2
    let icon_name = 'na';
    let iconmap = {
      'clear-day' : '32',
      'clear-night' : '31',
      'rain' : '11',
      'snow' : '14',
      'sleet' : '18',
      'wind' : '24',
      'fog' : '20',
      'cloudy' : '26',
      'partly-cloudy-day' : '30',
      'partly-cloudy-night' : '29'
    };
    
    if (iconcode && (typeof iconmap[iconcode] !== "undefined")) {
      icon_name = iconmap[iconcode];
    }

    return icon_name;
  }, 

};  

////////////////////////////////////////////////////////////////////////////
// ### Driver for TWC Weather
function wxDriverTWC(stationID) {
  this._twcinit(stationID);
};

wxDriverTWC.prototype = {
  __proto__: wxDriver.prototype,
  
  drivertype: 'twc',
  maxDays: 7, 
  linkText: 'weather.com',
  
  // these will be dynamically reset when data is loaded
  linkURL: 'http://www.weather.com',
  linkTooltip: 'Visit the weather.com website',
  
  _baseURL: 'http://wxdata.weather.com/wxdata/weather/local/',
  
  // initialise the driver
  _twcinit: function(stationID) {
    this._init(stationID);
    this.capabilities.forecast.pressure =  false;
    this.capabilities.forecast.pressure_direction =  false;
    this.capabilities.forecast.visibility = false;
    this._woeidcache = new Object();
  },
  
  // for the yahoo driver, this is a wrapper around _refreshData. This is needed in order
  // to get the yahoo WOEID if this.stationID has been provided as lat,lon
  refreshData: function(deskletObj) {
    // reset the data object
    this._emptyData();
    this.linkTooltip = 'Visit the weather.com website';
    this.linkURL = 'http://www.weather.com';
    
    // process the forecast
    let a = this._getWeather(this._baseURL + encodeURIComponent(this.stationID) + '?cc=*&dayf=10&unit=m', function(weather) {
      if (weather) {
        this._load_forecast(weather);
      }
      // get the main object to update the display
      deskletObj.displayForecast();
      deskletObj.displayCurrent();   
      deskletObj.displayMeta(); 
    });
  },
  
  // process the xml and populate this.data
  _load_forecast: function (xml) {
    if (!xml) {
      this.data.status.forecast = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.cc = BBCWX_SERVICE_STATUS_ERROR;
      return;
    }    
    let days = [];
    
    let parser = new marknote.Parser();
    let doc = parser.parse(xml);
    if (!doc) {
      this.data.status.cc = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.forecast = BBCWX_SERVICE_STATUS_ERROR;
      return;
    }
    try {

      let rootElem = doc.getRootElement();
      if (rootElem.getName() == 'error') {
        this.data.status.cc = BBCWX_SERVICE_STATUS_ERROR;
        this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
        this.data.status.forecast = BBCWX_SERVICE_STATUS_ERROR;
        this.data.status.lasterror = rootElem.getChildElement('err').getText();
        return;
      }
      
      this.data.cc = new Object();
      this.data.days = [];


      let geo = rootElem.getChildElement("loc");

      let cc = rootElem.getChildElement('cc');
      let dayf = rootElem.getChildElement('dayf');


      let locparts = geo.getChildElement('dnam').getText().split(',');
      this.data.city = locparts[0].trim();
      //### TODO this returns state for US - somehow detect that and add US
      this.data.country = locparts[locparts.length-1].trim();
      this.linkURL = 'http://www.weather.com/weather/today/' + geo.getAttributeValue('id').trim();
      this.linkTooltip = this.lttTemplate.replace('%s', this.data.city);

      // data.region

      this.data.cc.temperature = cc.getChildElement('tmp').getText();
      this.data.cc.feelslike = cc.getChildElement('flik').getText();
      this.data.cc.obstime = new Date(cc.getChildElement('lsup').getText()).toLocaleFormat( "%H:%M %Z" );
      this.data.cc.weathertext = cc.getChildElement('t').getText();
      if(this.data.cc.weathertext == 'N/A') this.data.cc.weathertext = '';
      this.data.cc.icon = this._mapicon(cc.getChildElement('icon').getText());
      let wind = cc.getChildElement('wind');
      this.data.cc.wind_speed = wind.getChildElement('s').getText();
      this.data.cc.wind_direction = wind.getChildElement('t').getText();
      this.data.cc.humidity = cc.getChildElement('hmid').getText();
      this.data.cc.visibility = cc.getChildElement('vis').getText();
      let bar = cc.getChildElement('bar');
      this.data.cc.pressure = bar.getChildElement('r').getText();
      this.data.cc.pressure_direction = bar.getChildElement('d').getText().ucwords();

      let forecasts = dayf.getChildElements("day");

      for (let i=0; i<forecasts.length; i++) {
        let day = new Object();
        day.day = forecasts[i].getAttributeValue('t').substring(0,3);
        day.maximum_temperature = forecasts[i].getChildElement('hi').getText();
        day.minimum_temperature = forecasts[i].getChildElement('low').getText();
        var dayparts = forecasts[i].getChildElements("part");
        var p = 0;
        if (dayparts[0].getChildElement('icon').getText() == '') p = 1;
        day.weathertext = dayparts[p].getChildElement('t').getText();
        day.icon = this._mapicon(dayparts[p].getChildElement('icon').getText());
        day.humidity = dayparts[p].getChildElement('hmid').getText();
        var windf = dayparts[p].getChildElement('wind');
        day.wind_speed = windf.getChildElement('s').getText();
        day.wind_direction = windf.getChildElement('t').getText();
        this.data.days[i] = day;
      }
        
      this.data.status.forecast = BBCWX_SERVICE_STATUS_OK;
      this.data.status.meta = BBCWX_SERVICE_STATUS_OK;
      this.data.status.cc = BBCWX_SERVICE_STATUS_OK;
    } catch(e) {
      global.logError(e);
      this.data.status.forecast = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.meta = BBCWX_SERVICE_STATUS_ERROR;
      this.data.status.cc = BBCWX_SERVICE_STATUS_ERROR;
    }
  },
  
  _mapicon: function(code) {
    // Use codes as listed by Yahoo! as weather.com supplies their data
    // http://developer.yahoo.com/weather/#codes
    let icon_name = 'na';
    let iconmap = {
      '0' : '00',
      '1' : '01',
      '2' : '01',
      '3' : '03',
      '4' : '04',
      '5' : '05',
      '6' : '06',
      '7' : '07',
      '8' : '08',
      '9' : '09',
      '10' : '10',
      '11' : '11',
      '12' : '12',
      '13' : '13',
      '14' : '41',
      '15' : '15',
      '16' : '16',
      '17' : '18',
      '18' : '18',
      '19' : '19',
      '20' : '20',
      '21' : '22',
      '22' : '22',
      '23' : '23',
      '24' : '24',
      '25' : '25',
      '26' : '26',
      '27' : '27',
      '28' : '28',
      '29' : '29',
      '30' : '30',
      '31' : '31',
      '32' : '32',
      '33' : '33',
      '34' : '34',
      '35' : '06',
      '36' : '36',
      '37' : '37',
      '38' : '38',
      '39' : '39', // this seems to map to showers
      '40' : '39',
      '41' : '16',
      '42' : '41',
      '43' : '16',
      '44' : '30',
      '45' : '47',
      '46' : '46',
      '47' : '47',
      '3200' : 'na'
    }
    if (code && (typeof iconmap[code] !== "undefined")) {
      icon_name = iconmap[code];
    }
    // ### TODO consider some text based overides, eg
    // /light rain/i    11
    
    return icon_name;
  },
  
};  


////////////////////////////////////////////////////////////////////////////
// ### END DRIVERS ###

////////////////////////////////////////////////////////////////////////////
// Utility function to capitalise first letter of each word in a string
String.prototype.ucwords = function() {
    return this.replace(/(?:^|\s)\S/g, function(a) { return a.toUpperCase(); });
};

function main(metadata, desklet_id){
  let desklet = new MyDesklet(metadata,desklet_id);
  return desklet;
};


