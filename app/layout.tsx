import "./globals.css";
import type { Metadata, Viewport } from "next";
import InstallAppPrompt from "@/components/pwa/InstallAppPrompt";
import GlobalInstitutePausedGuard from "@/components/GlobalInstitutePausedGuard";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.edutechlab.in"),
  title: {
    default: "EduTechLab — Best School Management Software & ERP Platform in India",
    template: "%s | EduTechLab",
  },
  description:
    "India's modern, cloud-based school management ERP software for schools, coaching centers & madrasas. Easily manage student admissions, automated fee collection, daily attendance, WhatsApp notifications, exams, and PVC ID cards.",
  keywords: [
    "school management software",
    "school ERP software India",
    "best school management system",
    "student fee management software",
    "school attendance software",
    "madrasa management software",
    "coaching institute management system",
    "school software Bihar",
    "school software Katihar",
    "student id card generator software",
    "report card marksheet generator",
    "school admission software",
    "EduTechLab",
    "edutechlab.in",
  ],
  authors: [{ name: "EduTechLab Team", url: "https://www.edutechlab.in" }],
  creator: "EduTechLab",
  publisher: "EduTechLab",
  alternates: {
    canonical: "https://www.edutechlab.in",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "EduTechLab",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    title: "EduTechLab — Complete School Management Software & ERP Platform",
    description:
      "Manage admissions, fees, attendance, examinations, and PVC ID cards effortlessly. Start your 15-day free trial.",
    url: "https://www.edutechlab.in",
    siteName: "EduTechLab",
    images: [
      {
        url: "/icons/icon-512.png",
        width: 512,
        height: 512,
        alt: "EduTechLab School ERP Platform",
      },
    ],
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "EduTechLab — Complete School Management Software & ERP Platform",
    description:
      "India's modern school management software for admissions, fees, exams & ID cards.",
    images: ["/icons/icon-512.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#6657e8",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="application-name" content="EduTechLab" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "SoftwareApplication",
                  "name": "EduTechLab",
                  "url": "https://www.edutechlab.in",
                  "description":
                    "Complete cloud-based School Management ERP software for admissions, fee collection, student attendance, exams, and PVC ID cards.",
                  "applicationCategory": "EducationalApplication",
                  "operatingSystem": "All (Web, Android, iOS)",
                  "offers": {
                    "@type": "Offer",
                    "price": "0",
                    "priceCurrency": "INR",
                    "description": "15-day free trial",
                  },
                  "aggregateRating": {
                    "@type": "AggregateRating",
                    "ratingValue": "4.9",
                    "ratingCount": "128",
                    "bestRating": "5",
                  },
                },
                {
                  "@type": "Organization",
                  "name": "EduTechLab",
                  "url": "https://www.edutechlab.in",
                  "logo": "https://www.edutechlab.in/icons/icon-512.png",
                  "contactPoint": {
                    "@type": "ContactPoint",
                    "telephone": "+91-7903178550",
                    "contactType": "Customer Support",
                    "areaServed": "IN",
                    "availableLanguage": ["Hindi", "English"],
                  },
                },
              ],
            }),
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function() {});
                });
              }
            `,
          }}
        />
      </head>
      <body>
        <GlobalInstitutePausedGuard />
        {children}
        <InstallAppPrompt />
      </body>
    </html>
  );
}