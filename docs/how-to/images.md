# Let Koda look at images and make them

Koda can open an image from your vault and describe or read it, and it can generate an image and show it in the chat. Both need a little from your setup; this page says what.

## Let Koda look at an image

Ask about an image by its path or name: "What does `Attachments/receipt.png` show?" Koda calls `read_image` (formats: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`). What happens next depends on the model:

- **A model that sees images** (Koda judges by the model name, for example a name with `vl`, `vision` or `gemma-4`) gets the picture together with the tool result and answers from it. "Probably" is enough; if the server refuses the picture, see below.
- **A model that does not see images** gets the text in the image, if [Image to Markdown](https://github.com/johannes-kaindl/image-to-markdown) is active. That is text recognition: it reads printed text well and describes nothing.
- **Neither:** Koda does not offer `read_image` at all, so the model cannot waste a turn on it.

If the server rejects a request with an image (HTTP error) and Image to Markdown is active, Koda swaps the picture for the recognised text, repeats the round once and says so in a notice.

Your session file keeps only the image's path, never the picture. Old pictures drop out of the conversation when Koda compacts it, like other bulky tool results.

An image above **Largest image Koda reads** (**Settings → Koda**, default 4096 KB) is not sent to the model: with Image to Markdown active the text is read instead, otherwise the answer says the image is too large.

## Let Koda generate an image

Needs [Local Image Generator](https://github.com/johannes-kaindl/local-image-generator), active and with a reachable backend. While it is active, Koda offers `generate_image`: "Make me a picture of a fox in a garden."

- In the **Koda folder** (default target `Koda/images`) Koda generates without asking.
- Anywhere else (name a folder in your request) a dialog shows the prompt and the target folder **first**. Nothing is generated until you select **Generate**.
- The answer embeds the image, so it shows in the chat, and the file lies in the vault like any other.

Generating can take a while on a local machine. If the plugin is busy or its backend is down, Koda tells you and does not retry on its own; see [Troubleshooting](troubleshooting.md#images).

## Switch them off

Both tools appear in **Settings → Koda → Model control → Tools** like the others; see [Tune Koda for a smaller model](model-control.md).
