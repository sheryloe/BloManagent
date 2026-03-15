const fs = require("fs");
const path = require("path");

const token = process.env.NOTION_TOKEN;
const parentPageId = process.env.NOTION_PARENT_PAGE_ID;
const notionVersion = "2022-06-28";

if (!token || !parentPageId) {
  console.error("Set NOTION_TOKEN and NOTION_PARENT_PAGE_ID before running this script.");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  "Notion-Version": notionVersion,
  "Content-Type": "application/json",
};

const richText = (content) => {
  const chunks = [];
  for (let start = 0; start < content.length; start += 1800) {
    chunks.push(content.slice(start, start + 1800));
  }
  return (chunks.length ? chunks : [""]).map((chunk) => ({
    type: "text",
    text: { content: chunk },
  }));
};

const paragraph = (content) => ({
  object: "block",
  type: "paragraph",
  paragraph: { rich_text: richText(content) },
});

const heading = (level, content) => ({
  object: "block",
  type: `heading_${level}`,
  [`heading_${level}`]: { rich_text: richText(content) },
});

const bullet = (content) => ({
  object: "block",
  type: "bulleted_list_item",
  bulleted_list_item: { rich_text: richText(content) },
});

const numbered = (content) => ({
  object: "block",
  type: "numbered_list_item",
  numbered_list_item: { rich_text: richText(content) },
});

const code = (content, language = "plain text") => ({
  object: "block",
  type: "code",
  code: {
    rich_text: richText(content),
    language,
  },
});

const notionRequest = async (pathname, method, body) => {
  const response = await fetch(`https://api.notion.com/v1${pathname}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.message ?? `Notion API error: ${response.status}`);
  }
  return payload;
};

const appendChildren = async (pageId, children) => {
  for (let index = 0; index < children.length; index += 100) {
    await notionRequest(`/blocks/${pageId}/children`, "PATCH", {
      children: children.slice(index, index + 100),
    });
  }
};

const createPage = async ({ title, children }) => {
  const firstBatch = children.slice(0, 100);
  const page = await notionRequest("/pages", "POST", {
    parent: { page_id: parentPageId },
    properties: {
      title: {
        title: [{ text: { content: title } }],
      },
    },
    children: firstBatch,
  });
  if (children.length > 100) {
    await appendChildren(page.id, children.slice(100));
  }
  return page;
};

const parseMarkdown = (source) => {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let title = null;
  let paragraphLines = [];
  let codeLanguage = null;
  let codeLines = [];

  const flushParagraph = () => {
    const text = paragraphLines.join(" ").trim();
    if (text) blocks.push(paragraph(text));
    paragraphLines = [];
  };

  const flushCode = () => {
    if (codeLanguage === null) return;
    blocks.push(code(codeLines.join("\n"), codeLanguage || "plain text"));
    codeLanguage = null;
    codeLines = [];
  };

  for (const line of lines) {
    if (codeLanguage !== null) {
      if (line.startsWith("```")) {
        flushCode();
      } else {
        codeLines.push(line);
      }
      continue;
    }

    if (line.startsWith("```")) {
      flushParagraph();
      codeLanguage = line.slice(3).trim() || "plain text";
      codeLines = [];
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    if (line.startsWith("# ")) {
      flushParagraph();
      title = line.slice(2).trim();
      continue;
    }

    if (line.startsWith("## ")) {
      flushParagraph();
      blocks.push(heading(2, line.slice(3).trim()));
      continue;
    }

    if (line.startsWith("### ")) {
      flushParagraph();
      blocks.push(heading(3, line.slice(4).trim()));
      continue;
    }

    if (line.startsWith("- ")) {
      flushParagraph();
      blocks.push(bullet(line.slice(2).trim()));
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      flushParagraph();
      blocks.push(numbered(line.replace(/^\d+\.\s/, "").trim()));
      continue;
    }

    paragraphLines.push(line.trim());
  }

  flushParagraph();
  flushCode();

  if (!title) {
    throw new Error("Markdown file must start with a level-1 heading.");
  }

  return { title, blocks };
};

const main = async () => {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error("Provide one or more markdown file paths.");
    process.exit(1);
  }

  for (const fileArg of args) {
    const filePath = path.resolve(process.cwd(), fileArg);
    const source = fs.readFileSync(filePath, "utf8");
    const statsText = source.replace(/\s+/g, " ").trim();
    if (statsText.length < 2000 || statsText.length > 3100) {
      throw new Error(`Length out of range for ${path.basename(filePath)}: ${statsText.length}`);
    }
    const { title, blocks } = parseMarkdown(source);
    const page = await createPage({ title, children: blocks });
    console.log(`${title}\t${page.url}\t${statsText.length}`);
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
