---
name: "update-product-md"
description: "Updates PRODUCT.md with recent development changes. Invoke after any feature implementation, bug fix, or config change to keep documentation in sync."
---

# Update PRODUCT.md

After any code change (feature, bug fix, refactor, config update), update `PRODUCT.md` to keep the documentation in sync.

## Steps

1. **Read current PRODUCT.md** to understand existing structure
2. **Identify what changed** in this session:
   - New features → add to corresponding version section
   - Bug fixes → add to "已知问题 & 经验教训" table
   - New components/files → update "文件结构" section
   - API changes → update relevant sections
3. **Update the document**:
   - Update `最后更新` timestamp at the top (format: `YYYY-MM-DD HH:MM`)
   - Add new version section if significant new feature (v1.x)
   - Append to existing version section if incremental change
   - Update "已知问题" table with new bug fixes
   - Update "文件结构" if new files were added
4. **Commit** the PRODUCT.md change together with code changes

## Key Sections to Maintain

| Section | When to Update |
|---------|---------------|
| 最后更新 timestamp | Every change |
| 开发历史 (v1.x) | New features or significant fixes |
| 已知问题 & 经验教训 | Bug fixes with root cause + solution |
| 文件结构 | New/renamed/deleted files |
| 功能模块 | Feature additions or behavior changes |
| 数据模型 | Schema changes |

## Rules

- Never skip updating PRODUCT.md after a code change
- Keep version notes concise but descriptive (include root cause for bugs)
- Timestamp must be Beijing time
- Commit PRODUCT.md in the same commit as code changes when possible
