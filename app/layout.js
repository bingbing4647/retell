import "./globals.css";

export const metadata = {
  title: "朵拉爱冒险 · 英语复述",
  description: "看完一集动画，用九张图把故事讲一遍。三年级英语复述练习。",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F5821F",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
