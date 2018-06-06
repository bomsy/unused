const puppeteer = require("puppeteer");
const css = require("css");
const chalk = require("chalk");
const fs = require("fs");

let browser = null;
let links = null;
/*const links = ['https://www.comparethemarket.com',
               'https://www.comparethemarket.com/car-insurance/',
               'https://www.comparethemarket.com/home-insurance/',
               'https://www.comparethemarket.com/life-insurance/',
               'https://www.comparethemarket.com/pet-insurance/',
               'https://www.comparethemarket.com/travel-insurance/',
               'https://www.comparethemarket.com/broadband/',
               'https://www.comparethemarket.com/energy/',
               'https://www.comparethemarket.com/credit-cards/',
               'https://www.comparethemarket.com/business-insurance/',
               'https://www.comparethemarket.com/van-insurance/'];*/

const stylesheet = 'https://cdn.comparethemarket.com/market/assets/responsive2015/sass/styles__243997a82c6317c8e36f126f9fb1e638.css';
const filepath = './unused-selectors.txt';
const linksfile = './links.csv';

function findSelectors(stylesheet) {
  let selectors = [];
  for(const rule of stylesheet.rules) {
    //console.log(rule);
    const ruleSelectors = rule.selectors;
    if (ruleSelectors) {
      selectors = selectors.concat(ruleSelectors);
    }
  }
  return selectors;
}

function removeInvalidText(content) {
  return content.replace(/&gt;/g, '>')
}

function writeToFile(content) {
  fs.writeFile(filepath, content, err => {
    if(err) {
      console.log(chalk.red(err))
    }

    console.log(chalk.green(filepath + ' written successfully.'))
  });
}

// Should return a list of selectors which are not
// used on this page
async function findUnusedSelectors(page, selectors) {
  const unused = [];
  for (let selector of selectors) {
    let isUsed = false;
    selector = removeInvalidText(selector);
    await page.evaluate(slctr => {
      const slctrArray = slctr.split(":");
      const hasPseudo = ["hover", "before", "after", "active", "focus"].includes(slctrArray[1]);
      return document.querySelectorAll(hasPseudo ? slctrArray[0] : slctr).length > 0;
    }, selector).then(result => isUsed = result, () => isUsed = false);

    if (!isUsed) {
      unused.push(selector);
    }
  }
  return unused;
}

async function loadPage(url, browser) {
  console.log(url);
  const page = await browser.newPage();
  await page.goto(url);
  return page;
}

async function init() {
  browser = await puppeteer.launch();
  // css
  const cssPage = await loadPage( stylesheet, browser);
  const cssContent = await cssPage.content();
  const cssText = cssContent
                  .replace('<html><head></head><body><pre style="word-wrap: break-word; white-space: pre-wrap;">', '')
                  .replace('</pre></body></html>', '');

  // parse the css text
  const cssAst = css.parse(cssText, { source: 's.css'});
  const cssSelectors = findSelectors(cssAst.stylesheet);

  let unusedSelectors = cssSelectors;
  console.log('no of unused css before > ', cssSelectors.length);

  // read in links from file
  await fs.readFile(linksfile, 'utf8', async(err, data) => {
    if(err) {
      console.log(err);
    }
    links = data.split('\r\n').filter(link => !!link);
    for (const link of links) {
      const page = await loadPage(link, browser);
      unusedSelectors = await findUnusedSelectors(page, unusedSelectors);
      console.log('no of unused css after > ', unusedSelectors.length);
      // page.close();
    }
    const unusedSelectorsText = unusedSelectors.join('\n');
    writeToFile(unusedSelectorsText);

    await browser.close();
  });
}

init();
