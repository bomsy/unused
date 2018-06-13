const puppeteer = require("puppeteer");
const sourceMap = require("source-map");
const css = require("css");
const chalk = require("chalk");
const fs = require("fs");

let browser = null;
let links = null;
let consumer = null;

let stylesheet, sourcemapfile, linksfile;
let outputfile = './default.json';

function findSelectors(stylesheet) {
  let selectors = [];
  for (const rule of stylesheet.rules) {
    if (rule.selectors) {
      selectors.push({ selector: rule.selectors.join(', '), position: rule.position });
    }
  }
  return selectors;
}

function removeInvalidText(content) {
  return content.replace(/&gt;/g, '>')
}

function writeToFile(content) {
  fs.writeFile(outputfile, content, err => {
    if(err) {
      console.log(chalk.red(err))
    }
    console.log(chalk.green(outputfile + ' written successfully.'))
  });
}

// Should return a list of selectors which are not
// used on this page
async function findUnusedSelectors(page, selectors) {
  const unused = [];
  for (let sel of selectors) {
    let isUsed = false;
    const selector = removeInvalidText(sel.selector);

    await page.evaluate(slctr => {
      const slctrArray = slctr.split(":");
      const hasPseudo = ["hover", "before", "after", "active", "focus"].includes(slctrArray[1]);
      return document.querySelectorAll(hasPseudo ? slctrArray[0] : slctr).length > 0;
    }, selector).then(result => isUsed = result, () => isUsed = false);

    if (!isUsed) {
      if (consumer !== null) {
        sel.original = consumer.originalPositionFor(sel.position.start);
      }
      unused.push(sel);
    }
  }

  return unused;
}

async function loadPage(url, browser) {
  console.log(chalk.yellow('scanning...'), chalk.gray(url));
  const page = await browser.newPage();
  await page.goto(url);
  return page;
}

async function getCssText(stylesheet, browser) {
  if (stylesheet.startsWith('https://')) {
    const cssPage = await loadPage(stylesheet, browser);
    const cssContent = await cssPage.content();
    return cssContent
      .replace('<html><head></head><body><pre style="word-wrap: break-word; white-space: pre-wrap;">', '')
      .replace('</pre></body></html>', '');
  } else {
    const content = fs.readFileSync(stylesheet, 'utf8');
    if (typeof content !== 'string') {
      console.error(content);
      return '';
    }
    return content;
  }
}

async function init(options) {
  stylesheet = options.stylesheet;
  sourcemapfile = options.sourcemap;
  linksfile = options.links;
  outputfile = options.output || outputfile;
  
  browser = await puppeteer.launch();
  const cssText = await getCssText(stylesheet, browser);

  // parse the css text
  const cssAst = css.parse(cssText);
  const cssSelectors = findSelectors(cssAst.stylesheet);

  //parse the Map
  if (sourcemapfile) {
    const rawSourceMap = fs.readFileSync(sourcemapfile, 'utf8');
    if (typeof rawSourceMap  !== 'string') {
      console.error(chalk.red(rawSourceMap));
    }
    consumer = await new sourceMap.SourceMapConsumer(rawSourceMap);
  }

  let unusedSelectors = cssSelectors;
  console.log('no of unused css before > ', cssSelectors.length);

  // read in links from file
  const content = fs.readFileSync(linksfile, 'utf8');
  if (typeof content !== 'string') {
    console.error(err);
    return;
  }
  links = content.split('\r\n').filter(link => !!link);

  for (const link of links) {
    const page = await loadPage(link, browser);
    unusedSelectors = await findUnusedSelectors(page, unusedSelectors);
    console.log('no of unused css after > ', unusedSelectors.length);
    // page.close();
  }
  const unusedSelectorsText = unusedSelectors.map(selector => {
    const original = selector.original;
    if (original == undefined) {
      return `{ selector": "${selector.selector}" },`;
    }
    return `{
      "selector": "${selector.selector}",
      "source": "${original.source}",
      "line": ${original.line},
      "column": ${original.column}
    },`;
  }).join('\n');

  writeToFile(`[${unusedSelectorsText}]`);

  if (consumer) {
    consumer.destroy();
  }
  await browser.close();
}

module.exports = init
