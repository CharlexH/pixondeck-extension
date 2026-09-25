# Photo examples / 实拍反推示例

Real stock photographs with unedited image-to-prompt outputs. No sample photograph was generated with AI.

使用真实图库照片，展示未经人工改写的反推提示词；示例照片并非 AI 生成。

## Photo credits / 图片来源

Each linked StockSnap photo page explicitly lists **CC0**. License/source checked on 2026-09-26. These photographs retain their [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) dedication; the repository's Apache-2.0 license does not replace it. Attribution is included for traceability. Photos demonstrate photographic styles, not endorsement by the people, photographers, or brands shown.

以下 StockSnap 原始页面均明确标注 **CC0**，于 2026-09-26 核验。图片沿用 CC0 授权，保留作者与来源便于追溯；仅作为摄影风格示例，不表示图中人物、摄影师或品牌为本产品背书。

| File / 文件 | Photographer / 摄影师 | Source / 来源 |
| --- | --- | --- |
| [portrait.png](portrait.png) | Matt Moloney | [Outdoor portrait / 户外人像](https://stocksnap.io/photo/woman-portrait-ZG1SST226T) · [downloaded rendition](https://cdn.stocksnap.io/img-thumbs/960w/woman-portrait_ZG1SST226T.jpg) |
| [skincare.png](skincare.png) | Jessica Weiller | [Perfume product / 香水产品](https://stocksnap.io/photo/perfume-bottle-0BZ1W3NNQK) · [downloaded rendition](https://cdn.stocksnap.io/img-thumbs/960w/perfume-bottle_0BZ1W3NNQK.jpg) |
| [watch.png](watch.png) | Jens Kreuter | [Smartwatch product / 智能手表产品](https://stocksnap.io/photo/silver-watch-4F9UDG0I8Q) · [downloaded rendition](https://cdn.stocksnap.io/img-thumbs/960w/silver-watch_4F9UDG0I8Q.jpg) |

## How these outputs were obtained / 反推方式

The 960-pixel-wide stock renditions were downloaded and losslessly converted to PNG for the demo. A copy was resized to a maximum edge of 480 pixels and sent through PixOnDeck's existing reverse-prompt provider adapter. Model: `openai/gpt-5.6-sol`; prompt version: `reverse-v1`. The complete returned text is below and in [results.json](results.json). No image-generation calls were made.

下载图库提供的 960 像素宽版本，无损转换为 PNG 用于演示。反推输入另缩至最长边 480 像素，通过 PixOnDeck 现有反推接口适配器获取下方完整文本；未调用生图服务。

The UI screenshots replay these actual outputs in the extension's local preview. Account, task-history, and favorite state are demonstration fixtures, not a live signed-in session. Outputs are examples, not a quality benchmark; a prompt describes visible style and cannot recover an original creator's exact prompt.

界面截图在插件本地预览中回放这些真实反推结果；账号、历史记录与收藏状态为演示数据，并非真实登录会话。提示词描述可见内容与风格，不代表能够还原原作者的原始提示词。

## Outdoor portrait / 户外人像

![Outdoor portrait / 户外人像](portrait.png)

<details>
<summary>Full reverse prompt / 完整反推提示词</summary>

Landscape-oriented close-up portrait of a young woman outdoors in a leafy park, photographed at eye level with a natural 50mm-style perspective. She stands left of center in a three-quarter back pose, bare shoulder nearest the camera, turning her head to look directly into the lens. Long wavy brown hair falls over her back and shoulder; she wears a rust-orange sleeveless top and a small pearl stud earring. Her face and shoulder are sharply focused while the background is softly blurred. A paved path recedes behind her toward the right, bordered by grass, large dark tree trunks and dense green canopies; a fence and sidewalk appear along the left, with indistinct park structures in the distance. Strong warm sunlight strikes her face and shoulder from the front-left, creating bright skin highlights and defined shadows, while the path is patterned with tree shade. Natural colors, shallow depth of field, candid cinematic photography.

</details>

## Perfume product / 香水产品

![Perfume product / 香水产品](skincare.png)

<details>
<summary>Full reverse prompt / 完整反推提示词</summary>

Landscape-oriented minimalist product photograph of a single square glass perfume bottle, viewed from a slightly elevated front angle and positioned just left of center on a smooth pale blush-beige surface. The transparent faceted bottle contains peach-pink liquid and has a thick patterned glass base. A rectangular cream label with a fine border and delicate cursive writing is centered on the front. A large clear geometric crystal cap with silver-toned inner fittings sits on top; a small black ribbon with a warm tan underside is tied around the neck and extends to the right. Strong warm light from the upper left creates bright highlights, refracted patterns around the base, and a long soft-edged dark shadow stretching diagonally toward the lower right foreground. Spacious off-white background with a subtle pink gradient, shallow depth of field, refined luxury cosmetics advertising style, clean composition, no other objects.

</details>

## Smartwatch product / 智能手表产品

![Smartwatch product / 智能手表产品](watch.png)

<details>
<summary>Full reverse prompt / 完整反推提示词</summary>

Product photograph of a silver rectangular smartwatch centered on a glossy dark gray reflective tabletop, viewed straight on from a low, slightly elevated angle in landscape orientation. The watch stands upright with its woven silver mesh band curving backward into a loop; the left band segment is darker in shadow and a small clasp or loose end rises behind it. The polished metal watch case and black screen face the camera, displaying large white digital numerals “10” above “53,” rotated sideways relative to the frame, with small interface marks near the right edge. A clear inverted reflection of the illuminated face and mesh band appears directly below, partially cropped by the lower frame. Shallow depth of field, softly blurred gray background with horizontal tonal bands, dim studio lighting, cool neutral palette, subtle highlights on brushed metal and polished glass, minimalist commercial product photography.

</details>
