Third-party libraries used by the ticket comment generator to read files in the browser.
They are loaded only when someone adds a QAgent report on the Ticket comment page.

pdf.min.js, pdf.worker.min.js   PDF.js 3.11.174 (Mozilla), Apache License 2.0, LICENSE-pdfjs.txt
mammoth.browser.min.js          Mammoth 1.8.0, BSD 2-Clause License, LICENSE-mammoth.txt

To update: npm pack pdfjs-dist@3 and mammoth, then copy the same files from build/ and the package root.
