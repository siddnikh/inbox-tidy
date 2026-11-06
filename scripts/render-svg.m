#import <Cocoa/Cocoa.h>

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc < 4) {
      fprintf(stderr, "usage: render-svg <in.svg> <out.png> <width> [height]\n");
      return 2;
    }
    NSString *input = [NSString stringWithUTF8String:argv[1]];
    NSImage *image = [[NSImage alloc] initWithContentsOfFile:input];
    if (!image || image.size.width <= 0) {
      fprintf(stderr, "could not read %s\n", argv[1]);
      return 1;
    }
    NSInteger width = atoi(argv[3]);
    NSInteger height = argc >= 5 ? atoi(argv[4])
                                 : (NSInteger)llround(width * image.size.height / image.size.width);
    NSBitmapImageRep *rep = [[NSBitmapImageRep alloc] initWithBitmapDataPlanes:NULL
                                                                    pixelsWide:width
                                                                    pixelsHigh:height
                                                                 bitsPerSample:8
                                                               samplesPerPixel:4
                                                                      hasAlpha:YES
                                                                      isPlanar:NO
                                                                colorSpaceName:NSDeviceRGBColorSpace
                                                                   bytesPerRow:0
                                                                  bitsPerPixel:0];
    rep.size = NSMakeSize(width, height);
    [NSGraphicsContext saveGraphicsState];
    NSGraphicsContext.currentContext = [NSGraphicsContext graphicsContextWithBitmapImageRep:rep];
    NSGraphicsContext.currentContext.imageInterpolation = NSImageInterpolationHigh;
    [image drawInRect:NSMakeRect(0, 0, width, height)
             fromRect:NSZeroRect
            operation:NSCompositingOperationCopy
             fraction:1.0];
    [NSGraphicsContext restoreGraphicsState];
    NSData *png = [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
    if (![png writeToFile:[NSString stringWithUTF8String:argv[2]] atomically:YES]) {
      fprintf(stderr, "could not write %s\n", argv[2]);
      return 1;
    }
  }
  return 0;
}
