const {app,BrowserWindow} = require('electron');
const base=require('./target.json').origin;
const url=new URL(base);
if(url.protocol!=='https:' && !(url.protocol==='http:' && url.hostname==='127.0.0.1' && !app.isPackaged)) throw new Error('An HTTPS release origin is required');
const allowed=value=>{try{return new URL(value).origin===url.origin;}catch{return false;}};
function open() {
  const window=new BrowserWindow({width:1400,height:900,minWidth:420,minHeight:640,backgroundColor:'#142b4f',
    autoHideMenuBar:true,webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false,webviewTag:false}});
  const web=window.webContents;
  web.session.setPermissionRequestHandler((contents,permission,complete)=>complete(false));
  web.session.setPermissionCheckHandler(()=>false);
  web.setWindowOpenHandler(()=>({action:'deny'}));
  for(const event of ['will-navigate','will-redirect']) web.on(event,(e,target)=>{if(!allowed(target))e.preventDefault();});
  web.on('will-attach-webview',event=>event.preventDefault());
  web.on('did-fail-load',(_event,code,_description,_url,mainFrame)=>{
    if(mainFrame && code!==-3) window.loadFile(__dirname+'/offline.html');
  });
  window.loadURL(url.href);
}
app.enableSandbox();
app.whenReady().then(open);
app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)open();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
