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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const getExifRotation = (orientation: number): number => {
    switch (orientation) {
      case 3:
        return 180;
      case 6:
        return 90;
      case 8:
        return 270;
      default:
        return 0;
    }
  };

  const cleanupObjectURL = (url: string) => {
    if (url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
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

  const rotateImageData = async (
    imageBlob: Blob,
    degrees: number
  ): Promise<Blob> => {
    return new Promise((resolve) => {
      const img = document.createElement("img");
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d")!;

        if (degrees === 90 || degrees === 270) {
          canvas.width = img.height;
          canvas.height = img.width;
        } else {
          canvas.width = img.width;
          canvas.height = img.height;
        }

        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((degrees * Math.PI) / 180);
        ctx.drawImage(
          img,
          -img.width / 2,
          -img.height / 2,
          img.width,
          img.height
        );

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            }
          },
          "image/jpeg",
          1.0
        );
      };
      img.src = URL.createObjectURL(imageBlob);
    });
  };

  const processFile = async (file: File) => {
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
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const file = e.dataTransfer.files[0];
    if (file) {
      await processFile(file);
    }
  }, []);

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
            const rotation = getExifRotation(img.orientation);
            const fixedBlob = await rotateImageData(img.originalBlob, rotation);
            return {
              ...img,
              blob: fixedBlob,
              orientation: 1,
            };
          }
          return img;
        })
      );

      setImages(processedImages);
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
    <div className="w-full h-screen p-4 flex flex-col items-center justify-center">
      <Card className="w-full max-w-3xl">
        <CardContent className="p-6">
          {images.length === 0 ? (
            <div
              className={`w-full aspect-square rounded-lg border-2 border-dashed transition-colors ${
                isDragging ? "border-primary bg-secondary/20" : "border-border"
              }`}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <div className="h-full flex flex-col items-center justify-center gap-4">
                <div className="p-4 rounded-full bg-secondary">
                  <ImageIcon className="h-8 w-8 text-primary" />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="font-medium">Upload your images</h3>
                  <p className="text-sm text-muted-foreground">
                    Drag and drop a ZIP file here, or click to select
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={handleUploadClick}
                  disabled={isProcessing}
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
                    <Progress value={uploadProgress} className="h-2" />
                    <p className="text-sm text-center mt-2 text-muted-foreground">
                      Processing... {Math.round(uploadProgress)}%
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative w-full aspect-video bg-muted rounded-lg overflow-hidden">
                <div className="w-full h-full flex items-center justify-center">
                  <Image
                    key={images[currentImageIndex].url}
                    src={images[currentImageIndex].url}
                    alt={`Image ${currentImageIndex + 1}`}
                    fill
                    className="object-contain"
                    priority
                  />
                </div>

                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={previousImage}
                    disabled={isProcessing}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <span className="bg-background/80 px-2 py-1 rounded">
                    {currentImageIndex + 1} / {images.length}
                  </span>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={nextImage}
                    disabled={isProcessing}
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>

                <div className="absolute top-4 right-4 bg-background/80 px-2 py-1 rounded flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  EXIF: {images[currentImageIndex].orientation}
                </div>
              </div>

              <div className="flex gap-2 flex-wrap justify-center">
                <Button
                  onClick={fixOrientations}
                  disabled={isProcessing}
                  variant="secondary"
                >
                  <Wand2 className="mr-2 h-4 w-4" />
                  Fix All Orientations
                </Button>
                <Button onClick={downloadImages} disabled={isProcessing}>
                  <Download className="mr-2 h-4 w-4" />
                  Download Modified Images
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ExifEditor;
