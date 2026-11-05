// Native macOS shell for Inbox Tidy: one window hosting the Bun core's local web UI.
// Written in Objective-C because the machine's Swift toolchain and SDK can mismatch;
// clang + Cocoa + WebKit is the most dependable build on Command Line Tools alone.
#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

static NSString *const kReadyPrefix = @"INBOX_TIDY_READY ";

@interface AppDelegate : NSObject <NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate>
@property(strong) NSWindow *window;
@property(strong) WKWebView *webView;
@property(strong) NSTask *core;
@property(strong) NSPipe *coreStdin;
@property(strong) NSMutableString *coreOutput;
@property(assign) BOOL ready;
@property(copy) NSString *appOrigin;
@end

@implementation AppDelegate

- (NSString *)logPath {
  NSString *dir = [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Logs/Inbox Tidy"];
  [[NSFileManager defaultManager] createDirectoryAtPath:dir withIntermediateDirectories:YES attributes:nil error:nil];
  return [dir stringByAppendingPathComponent:@"core.log"];
}

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
  [self buildMenu];
  [self buildWindow];
  [self showStatusPage:@"Opening Inbox Tidy…" detail:nil];

  NSString *devURL = [[[NSProcessInfo processInfo] environment] objectForKey:@"INBOX_TIDY_DEV_URL"];
  if (devURL.length > 0) {
    [self loadAppURL:devURL];
  } else {
    [self startCore];
  }
}

- (void)buildWindow {
  NSRect frame = NSMakeRect(0, 0, 1080, 760);
  NSWindowStyleMask style = NSWindowStyleMaskTitled | NSWindowStyleMaskClosable |
                            NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable |
                            NSWindowStyleMaskFullSizeContentView;
  self.window = [[NSWindow alloc] initWithContentRect:frame styleMask:style backing:NSBackingStoreBuffered defer:NO];
  self.window.title = @"Inbox Tidy";
  self.window.titlebarAppearsTransparent = YES;
  self.window.titleVisibility = NSWindowTitleHidden;
  self.window.minSize = NSMakeSize(820, 580);
  self.window.backgroundColor = [NSColor windowBackgroundColor];
  [self.window center];
  [self.window setFrameAutosaveName:@"InboxTidyMainWindow"];

  WKWebViewConfiguration *config = [[WKWebViewConfiguration alloc] init];
  self.webView = [[WKWebView alloc] initWithFrame:frame configuration:config];
  self.webView.navigationDelegate = self;
  self.webView.UIDelegate = self;
  [self.webView setValue:@NO forKey:@"drawsBackground"];
  self.window.contentView = self.webView;
  [self.window makeKeyAndOrderFront:nil];
  [NSApp activateIgnoringOtherApps:YES];
}

- (void)buildMenu {
  NSMenu *bar = [[NSMenu alloc] init];

  NSMenuItem *appItem = [[NSMenuItem alloc] init];
  NSMenu *appMenu = [[NSMenu alloc] init];
  [appMenu addItemWithTitle:@"About Inbox Tidy" action:@selector(orderFrontStandardAboutPanel:) keyEquivalent:@""];
  [appMenu addItem:[NSMenuItem separatorItem]];
  [appMenu addItemWithTitle:@"Hide Inbox Tidy" action:@selector(hide:) keyEquivalent:@"h"];
  [appMenu addItem:[NSMenuItem separatorItem]];
  [appMenu addItemWithTitle:@"Quit Inbox Tidy" action:@selector(terminate:) keyEquivalent:@"q"];
  appItem.submenu = appMenu;
  [bar addItem:appItem];

  // Without an Edit menu, Cmd+C / Cmd+V / Cmd+A do nothing inside the web view's text fields.
  NSMenuItem *editItem = [[NSMenuItem alloc] init];
  NSMenu *editMenu = [[NSMenu alloc] initWithTitle:@"Edit"];
  [editMenu addItemWithTitle:@"Undo" action:@selector(undo:) keyEquivalent:@"z"];
  [editMenu addItemWithTitle:@"Redo" action:@selector(redo:) keyEquivalent:@"Z"];
  [editMenu addItem:[NSMenuItem separatorItem]];
  [editMenu addItemWithTitle:@"Cut" action:@selector(cut:) keyEquivalent:@"x"];
  [editMenu addItemWithTitle:@"Copy" action:@selector(copy:) keyEquivalent:@"c"];
  [editMenu addItemWithTitle:@"Paste" action:@selector(paste:) keyEquivalent:@"v"];
  [editMenu addItemWithTitle:@"Select All" action:@selector(selectAll:) keyEquivalent:@"a"];
  editItem.submenu = editMenu;
  [bar addItem:editItem];

  NSMenuItem *viewItem = [[NSMenuItem alloc] init];
  NSMenu *viewMenu = [[NSMenu alloc] initWithTitle:@"View"];
  [viewMenu addItemWithTitle:@"Reload" action:@selector(reloadPage:) keyEquivalent:@"r"];
  viewItem.submenu = viewMenu;
  [bar addItem:viewItem];

  NSMenuItem *windowItem = [[NSMenuItem alloc] init];
  NSMenu *windowMenu = [[NSMenu alloc] initWithTitle:@"Window"];
  [windowMenu addItemWithTitle:@"Minimize" action:@selector(performMiniaturize:) keyEquivalent:@"m"];
  [windowMenu addItemWithTitle:@"Close" action:@selector(performClose:) keyEquivalent:@"w"];
  windowItem.submenu = windowMenu;
  [bar addItem:windowItem];
  NSApp.windowsMenu = windowMenu;

  NSApp.mainMenu = bar;
}

- (void)reloadPage:(id)sender {
  [self.webView reload];
}

- (void)startCore {
  NSString *corePath = [[NSBundle mainBundle] pathForResource:@"inbox-tidy-core" ofType:nil];
  if (!corePath) {
    [self showStatusPage:@"Inbox Tidy is missing a part." detail:@"Reinstall the app, then open it again."];
    return;
  }
  NSString *logPath = [self logPath];
  [[NSFileManager defaultManager] createFileAtPath:logPath contents:nil attributes:nil];
  NSFileHandle *log = [NSFileHandle fileHandleForWritingAtPath:logPath];

  self.core = [[NSTask alloc] init];
  self.core.executableURL = [NSURL fileURLWithPath:corePath];
  self.core.arguments = @[ @"--parent-watch" ];
  self.coreStdin = [NSPipe pipe];
  self.core.standardInput = self.coreStdin;
  NSPipe *out = [NSPipe pipe];
  self.core.standardOutput = out;
  self.core.standardError = log;
  self.coreOutput = [NSMutableString string];

  __weak AppDelegate *weakSelf = self;
  out.fileHandleForReading.readabilityHandler = ^(NSFileHandle *handle) {
    NSData *data = handle.availableData;
    if (data.length == 0) {
      handle.readabilityHandler = nil;
      return;
    }
    NSString *chunk = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] ?: @"";
    [log writeData:data];
    dispatch_async(dispatch_get_main_queue(), ^{
      [weakSelf handleCoreOutput:chunk];
    });
  };
  self.core.terminationHandler = ^(NSTask *task) {
    dispatch_async(dispatch_get_main_queue(), ^{
      AppDelegate *strongSelf = weakSelf;
      if (!strongSelf || [NSApp isRunning] == NO) return;
      [strongSelf showStatusPage:@"Inbox Tidy stopped working in the background."
                          detail:[NSString stringWithFormat:@"Quit and open the app again. If it keeps happening, the details are in %@", logPath]];
    });
  };

  NSError *error = nil;
  if (![self.core launchAndReturnError:&error]) {
    [self showStatusPage:@"Inbox Tidy couldn't start." detail:error.localizedDescription];
    return;
  }

  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(20 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
    AppDelegate *strongSelf = weakSelf;
    if (strongSelf && !strongSelf.ready) {
      [strongSelf showStatusPage:@"Inbox Tidy is taking too long to start."
                          detail:[NSString stringWithFormat:@"Quit and open it again. Details are in %@", logPath]];
    }
  });
}

- (void)handleCoreOutput:(NSString *)chunk {
  if (self.ready) return;
  [self.coreOutput appendString:chunk];
  for (NSString *line in [self.coreOutput componentsSeparatedByString:@"\n"]) {
    if ([line hasPrefix:kReadyPrefix]) {
      NSString *url = [[line substringFromIndex:kReadyPrefix.length]
          stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
      [self loadAppURL:url];
      return;
    }
  }
}

- (void)loadAppURL:(NSString *)urlString {
  NSURL *url = [NSURL URLWithString:urlString];
  if (!url) return;
  self.ready = YES;
  self.appOrigin = [NSString stringWithFormat:@"%@://%@:%@", url.scheme, url.host, url.port];
  [self.webView loadRequest:[NSURLRequest requestWithURL:url]];
}

- (void)showStatusPage:(NSString *)title detail:(NSString *)detail {
  NSString *safeTitle = [self escape:title];
  NSString *safeDetail = detail ? [self escape:detail] : @"";
  NSString *html = [NSString stringWithFormat:
      @"<!doctype html><html><head><meta name='color-scheme' content='light dark'><style>"
       "body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;"
       "font:15px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;background:Canvas;color:CanvasText;text-align:center}"
       "p{max-width:440px;color:GrayText;margin:8px auto 0}h1{font-size:20px;font-weight:600;margin:0}"
       "</style></head><body><div><h1>%@</h1><p>%@</p></div></body></html>",
      safeTitle, safeDetail];
  [self.webView loadHTMLString:html baseURL:nil];
}

- (NSString *)escape:(NSString *)text {
  return [[[text stringByReplacingOccurrencesOfString:@"&" withString:@"&amp;"]
      stringByReplacingOccurrencesOfString:@"<" withString:@"&lt;"]
      stringByReplacingOccurrencesOfString:@">" withString:@"&gt;"];
}

// Anything that is not the app itself (unsubscribe pages, help links) opens in the default browser.
- (void)webView:(WKWebView *)webView
    decidePolicyForNavigationAction:(WKNavigationAction *)action
                    decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
  NSURL *url = action.request.URL;
  NSString *scheme = url.scheme.lowercaseString;
  if ([scheme isEqualToString:@"about"] || [scheme isEqualToString:@"data"]) {
    decisionHandler(WKNavigationActionPolicyAllow);
    return;
  }
  NSString *origin = [NSString stringWithFormat:@"%@://%@:%@", url.scheme, url.host, url.port];
  if (self.appOrigin && [origin isEqualToString:self.appOrigin]) {
    decisionHandler(WKNavigationActionPolicyAllow);
    return;
  }
  if ([scheme isEqualToString:@"https"] || [scheme isEqualToString:@"http"] || [scheme isEqualToString:@"mailto"]) {
    [[NSWorkspace sharedWorkspace] openURL:url];
  }
  decisionHandler(WKNavigationActionPolicyCancel);
}

- (WKWebView *)webView:(WKWebView *)webView
    createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration
               forNavigationAction:(WKNavigationAction *)action
                    windowFeatures:(WKWindowFeatures *)features {
  NSURL *url = action.request.URL;
  if (url) [[NSWorkspace sharedWorkspace] openURL:url];
  return nil;
}

- (void)webView:(WKWebView *)webView
    runJavaScriptConfirmPanelWithMessage:(NSString *)message
                        initiatedByFrame:(WKFrameInfo *)frame
                       completionHandler:(void (^)(BOOL))completionHandler {
  NSAlert *alert = [[NSAlert alloc] init];
  alert.messageText = message;
  [alert addButtonWithTitle:@"OK"];
  [alert addButtonWithTitle:@"Cancel"];
  completionHandler([alert runModal] == NSAlertFirstButtonReturn);
}

- (void)webView:(WKWebView *)webView
    runJavaScriptAlertPanelWithMessage:(NSString *)message
                      initiatedByFrame:(WKFrameInfo *)frame
                     completionHandler:(void (^)(void))completionHandler {
  NSAlert *alert = [[NSAlert alloc] init];
  alert.messageText = message;
  [alert runModal];
  completionHandler();
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
  return YES;
}

- (void)applicationWillTerminate:(NSNotification *)notification {
  if (self.core.isRunning) {
    self.core.terminationHandler = nil;
    [self.core terminate];
    [self.core waitUntilExit];
  }
}

@end

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    NSApplication *app = [NSApplication sharedApplication];
    app.activationPolicy = NSApplicationActivationPolicyRegular;
    AppDelegate *delegate = [[AppDelegate alloc] init];
    app.delegate = delegate;
    [app run];
  }
  return 0;
}
