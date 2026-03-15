import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const current = process.argv[index];
  if (!current.startsWith("--")) continue;
  args.set(current.slice(2), process.argv[index + 1]);
}

const token = args.get("token") ?? process.env.NOTION_TOKEN;
const parentPageId = args.get("parent") ?? process.env.NOTION_PARENT_PAGE_ID;
const notionVersion = "2022-06-28";

if (!token || !parentPageId) {
  console.error("Usage: node scripts/publish-notion-series.mjs --token <token> --parent <page-id>");
  process.exit(1);
}

const repoRoot = process.cwd();
const notionDir = path.join(repoRoot, "docs", "notion", "BloManagent");

const pages = [
  "Step 1. 메인 URL 기반 블로그 진단 도구를 기획한 이유.md",
  "Step 2. SQLite와 공개 피드 기반 블로그 수집기 설계.md",
  "Step 3. LLM 없이 qualityScore를 계산하는 설명 가능한 알고리즘.md",
  "Step 4. 대시보드와 GitHub Pages 문서를 제품처럼 다듬는 과정.md",
  "Step 5. 티스토리 sitemap 오탐을 막는 strict verified-post discovery.md",
];

const headers = {
  Authorization: `Bearer ${token}`,
  "Notion-Version": notionVersion,
  "Content-Type": "application/json",
};

const chunkText = (content, size = 1800) => {
  const chunks = [];
  for (let start = 0; start < content.length; start += size) {
    chunks.push(content.slice(start, start + size));
  }
  return chunks.length ? chunks : [""];
};

const richText = (content) =>
  chunkText(content).map((chunk) => ({
    type: "text",
    text: {
      content: chunk,
    },
  }));

const headingBlock = (type, content) => ({
  object: "block",
  type,
  [type]: {
    rich_text: richText(content),
  },
});

const paragraphBlock = (content) => ({
  object: "block",
  type: "paragraph",
  paragraph: {
    rich_text: richText(content),
  },
});

const listBlock = (type, content) => ({
  object: "block",
  type,
  [type]: {
    rich_text: richText(content),
  },
});

const codeBlock = (content, language = "plain text") => ({
  object: "block",
  type: "code",
  code: {
    rich_text: richText(content),
    language,
  },
});

const markdownToBlocks = (markdown) => {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let paragraphLines = [];
  let inCode = false;
  let codeLanguage = "plain text";
  let codeLines = [];

  const flushParagraph = () => {
    const content = paragraphLines.join(" ").trim();
    if (content) {
      blocks.push(paragraphBlock(content));
    }
    paragraphLines = [];
  };

  const flushCode = () => {
    const content = codeLines.join("\n").trimEnd();
    if (content) {
      blocks.push(codeBlock(content, codeLanguage));
    }
    codeLines = [];
    codeLanguage = "plain text";
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        flushParagraph();
        inCode = true;
        codeLanguage = line.slice(3).trim() || "plain text";
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    if (line.startsWith("# ")) {
      flushParagraph();
      blocks.push(headingBlock("heading_1", line.slice(2).trim()));
      continue;
    }

    if (line.startsWith("## ")) {
      flushParagraph();
      blocks.push(headingBlock("heading_2", line.slice(3).trim()));
      continue;
    }

    if (line.startsWith("### ")) {
      flushParagraph();
      blocks.push(headingBlock("heading_3", line.slice(4).trim()));
      continue;
    }

    if (line.startsWith("- ")) {
      flushParagraph();
      blocks.push(listBlock("bulleted_list_item", line.slice(2).trim()));
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      flushParagraph();
      blocks.push(listBlock("numbered_list_item", line.replace(/^\d+\.\s/, "").trim()));
      continue;
    }

    paragraphLines.push(line.trim());
  }

  flushParagraph();
  if (inCode) flushCode();
  return blocks;
};

const notionRequest = async (pathname, method, body) => {
  const response = await fetch(`https://api.notion.com/v1${pathname}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.message ?? "Unknown Notion API error";
    throw new Error(message);
  }
  return payload;
};

const createPage = async (title, blocks) => {
  const initialChildren = blocks.slice(0, 100);
  const page = await notionRequest("/pages", "POST", {
    parent: {
      page_id: parentPageId,
    },
    properties: {
      title: {
        title: [
          {
            text: {
              content: title,
            },
          },
        ],
      },
    },
    children: initialChildren,
  });

  for (let index = 100; index < blocks.length; index += 100) {
    await notionRequest(`/blocks/${page.id}/children`, "PATCH", {
      children: blocks.slice(index, index + 100),
    });
  }

  return page;
};

for (const fileName of pages) {
  const filePath = path.join(notionDir, fileName);
  const markdown = await readFile(filePath, "utf8");
  const title = markdown.split("\n")[0].replace(/^#\s*/, "").trim();
  const blocks = markdownToBlocks(markdown);
  const page = await createPage(title, blocks);
  console.log(`Created: ${title} -> ${page.url}`);
}
