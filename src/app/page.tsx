"use client";
import React, { useState, useRef, useCallback } from "react";
import {
  Upload,
  Download,
  ArrowLeft,
  ArrowRight,
  Info,
  Wand2,
  Image as ImageIcon,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import JSZip from "jszip";
import EXIF from "exif-js";
import Image from "next/image";

interface ImageData {
  filename: string;
  url: string;
  blob: Blob;
  orientation: number;
  originalBlob: Blob;
}

const ExifEditor: React.FC = () => {
  const [images, setImages] = useState<ImageData[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isFixed, setIsFixed] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const cleanupObjectURL = (url: string) => {
    if (url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
  };

  const resetState = () => {
    // Cleanup existing blob URLs
    images.forEach((img) => cleanupObjectURL(img.url));

    // Reset all state
    setImages([]);
    setCurrentImageIndex(0);
    setUploadProgress(0);
    setIsProcessing(false);
    setIsDragging(false);
    setIsFixed(false);
    // Clear file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const processFile = useCallback(
    async (file: File) => {
      try {
        setIsProcessing(true);
        setUploadProgress(0);

        // Cleanup existing images
        images.forEach((img) => cleanupObjectURL(img.url));

        if (!file.name.endsWith(".zip")) {
          throw new Error("Please upload a ZIP file containing images.");
        }

        const zip = new JSZip();
        const contents = await zip.loadAsync(file);
        const imageFiles: ImageData[] = [];
        const totalFiles = Object.keys(contents.files).length;
        let processedFiles = 0;

        for (const [filename, zipEntry] of Object.entries(contents.files)) {
          if (!zipEntry.dir && /\.(jpg|jpeg|png)$/i.test(filename)) {
            const blob = await zipEntry.async("blob");
            const imageUrl = URL.createObjectURL(blob);

            const exifData = await new Promise<ImageData>((resolve) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              EXIF.getData(blob as any, function (this: any) {
                const orientation = EXIF.getTag(this, "Orientation") || 1;
                resolve({
                  filename,
                  url: imageUrl,
                  blob,
                  orientation,
                  originalBlob: blob.slice(0),
                });
              });
            });

            imageFiles.push(exifData);
          }
          processedFiles++;
          setUploadProgress((processedFiles / totalFiles) * 100);
        }

        if (imageFiles.length === 0) {
          throw new Error("No valid images found in ZIP file.");
        }

        setImages(imageFiles);
        setCurrentImageIndex(0);
        toast({
          title: "Success",
          description: `Loaded ${imageFiles.length} images from ZIP file.`,
        });
      } catch (error) {
        console.error("Failed to process file:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "An unknown error occurred",
        });
      } finally {
        setIsProcessing(false);
        setIsDragging(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [images, toast]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const file = e.dataTransfer.files[0];
      if (file) {
        await processFile(file);
      }
    },
    [processFile]
  );

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const fixOrientations = async (): Promise<void> => {
    try {
      setIsProcessing(true);
      const processedImages = await Promise.all(
        images.map(async (img) => {
          if (img.orientation !== 1) {
            const buffer = await img.originalBlob.arrayBuffer();
            const view = new DataView(buffer);

            for (let i = 0; i < buffer.byteLength - 2; i++) {
              if (view.getUint16(i) === 0x0112) {
                view.setUint16(i + 2, 1, false);
                break;
              }
            }

            const newBlob = new Blob([buffer], { type: img.originalBlob.type });
            cleanupObjectURL(img.url);
            const newUrl = URL.createObjectURL(newBlob);

            return {
              ...img,
              blob: newBlob,
              url: newUrl,
              orientation: 1,
            };
          }
          return img;
        })
      );

      setImages(processedImages);
      setIsFixed(true);
      toast({
        title: "Success",
        description: "All image orientations have been fixed!",
      });
    } catch (error) {
      console.error("Failed to fix orientations:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fix image orientations.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadImages = async (): Promise<void> => {
    try {
      setIsProcessing(true);
      const zip = new JSZip();

      images.forEach((img) => {
        zip.file(img.filename, img.blob);
      });

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);

      const link = document.createElement("a");
      link.href = url;
      link.download = "fixed_images.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);

      toast({
        title: "Success",
        description: "Images downloaded successfully!",
      });
    } catch (error) {
      console.error("Failed to download images:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to download images.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const nextImage = (): void => {
    setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const previousImage = (): void => {
    setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  React.useEffect(() => {
    return () => {
      images.forEach((img) => cleanupObjectURL(img.url));
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full bg-slate-50 p-6">
      <div
        className="flex absolute inset-0 z-0"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cg fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.08'%3E%3Cpath opacity='.5' d='M96 95h4v1h-4v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9zm-1 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-9-10h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm9-10v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-9-10h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm9-10v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-9-10h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm9-10v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-9-10h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9z'/%3E%3Cpath d='M6 5V0H5v5H0v1h5v94h1V6h94V5H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      ></div>
      <div className="z-10 max-w-2xl space-y-6">
        {/* Title and Explanation Section */}
        <div className="text-center space-y-3 mb-6">
          <h1 className="text-3xl font-bold tracking-tight">
            EXIF Orientation Fixer
          </h1>
          <p className="text-muted-foreground max-w-xl px-2">
            Fix incorrectly rotated photos from your smartphone. This tool
            automatically detects and corrects EXIF orientation issues.
          </p>
        </div>

        {/* Main Card */}
        <Card className="shadow-lg">
          <CardContent className="p-6">
            {images.length === 0 ? (
              <div
                className={`p-8 rounded-lg border-2 border-dashed transition-colors ${
                  isDragging
                    ? "border-primary bg-secondary/20"
                    : "border-border"
                }`}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <div className="h-full flex flex-col items-center justify-center gap-6">
                  <div className="p-4 rounded-full bg-secondary/30 ring-1 ring-secondary">
                    <ImageIcon className="h-10 w-10 text-primary" />
                  </div>
                  <div className="text-center space-y-2 max-w-md">
                    <h3 className="text-xl font-medium">Upload your images</h3>
                    <p className="text-sm text-muted-foreground">
                      Drag and drop a ZIP file containing your images here, or
                      click the button below to select
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleUploadClick}
                    disabled={isProcessing}
                    className="relative overflow-hidden"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Select ZIP File
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={isProcessing}
                  />
                  {isProcessing && (
                    <div className="w-full max-w-xs mt-4">
                      <div className="space-y-2">
                        <Progress value={uploadProgress} className="h-2" />
                        <p className="text-sm text-center text-muted-foreground">
                          Processing... {Math.round(uploadProgress)}%
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="relative w-full aspect-video bg-muted rounded-xl overflow-hidden shadow-sm">
                  <div className="w-full h-full flex items-center justify-center bg-neutral-100">
                    <Image
                      key={images[currentImageIndex].url}
                      src={images[currentImageIndex].url}
                      alt={`Image ${currentImageIndex + 1}`}
                      fill
                      className="object-contain"
                      priority
                    />
                  </div>

                  {/* Image Controls Overlay */}
                  <div className="absolute inset-0 flex flex-col justify-between p-4">
                    <div className="self-end">
                      <div className="bg-background/95 backdrop-blur-sm px-3 py-1.5 rounded-lg flex items-center gap-2 shadow-sm">
                        <Info className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">
                          EXIF Orientation:{" "}
                          {images[currentImageIndex].orientation}
                        </span>
                      </div>
                    </div>

                    <div className="self-center flex items-center gap-3">
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={previousImage}
                        disabled={isProcessing}
                        className="shadow-sm"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      <div className="bg-background/95 backdrop-blur-sm px-3 py-1.5 rounded-lg shadow-sm">
                        <span className="text-sm font-medium">
                          {currentImageIndex + 1} / {images.length}
                        </span>
                      </div>
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={nextImage}
                        disabled={isProcessing}
                        className="shadow-sm"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-3 justify-center">
                  <Button
                    onClick={fixOrientations}
                    disabled={isProcessing}
                    variant="secondary"
                    className="w-40"
                  >
                    <Wand2 className="mr-2 h-4 w-4" />
                    Fix Orientations
                  </Button>
                  <Button
                    onClick={downloadImages}
                    disabled={isProcessing || !isFixed}
                    className="w-40"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download ZIP
                  </Button>
                  <Button
                    onClick={resetState}
                    disabled={isProcessing}
                    variant="outline"
                    className="w-40"
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Upload New
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Additional Info */}
        <div className="text-center text-sm text-muted-foreground space-y-2">
          <p>
            All processing is done locally in your browser. Your images are
            never uploaded to any server.
          </p>
          <p>Made with ❤️ by Brayden.</p>
        </div>
      </div>
    </div>
  );
};

export default ExifEditor;
