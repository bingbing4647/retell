// 下载文件名的统一规则（纯函数，Server / Client 都能 import）。
//
// 单集：S02E25_Whose Birthday Is It.pdf
// 整季：Dora_S02_九宫格复述_26集.pdf
//
// Windows 文件名禁用字符 \ / : * ? " < > | 会被替换成空格，
// 因此 "Whose Birthday Is It?" 落到磁盘时问号自然消失。

const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f]/g;

export function safeFileName(input, maxLen = 120) {
  let s = String(input ?? "")
    .replace(ILLEGAL, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
  if (s.length > maxLen) s = s.slice(0, maxLen).trim();
  return s;
}

// 单集 PDF：<ID>_<剧名>.pdf
export function episodePdfName(lesson) {
  const id = safeFileName(lesson?.id) || "lesson";
  const title = safeFileName(lesson?.title);
  return title ? `${id}_${title}.pdf` : `${id}.pdf`;
}

// 整季 PDF：Dora_S02_九宫格复述_26集.pdf
export function seasonPdfName(season, episodes) {
  const s = String(Number(season) || 0).padStart(2, "0");
  const n = Number(episodes) || 0;
  return n ? `Dora_S${s}_九宫格复述_${n}集.pdf` : `Dora_S${s}_九宫格复述.pdf`;
}
