import './bootstrap.test';
import test from 'blue-tape';
import domino from 'domino';

import { setupScrapeClasses, convertWikicodeToHtml, testHtmlRewritingE2e } from 'test/util';
import { articleDetailXId } from 'src/stores';
import { saveArticles, treatMedias, applyOtherTreatments, treatSubtitle, treatVideo } from 'src/util/saveArticles';
import { ZimArticle } from '@openzim/libzim';
import { Dump } from 'src/Dump';
import { mwRetToArticleDetail } from 'src/util';

const html = `
    <img src=\"//upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Dendritic_cell_revealed.jpg/250px-Dendritic_cell_revealed.jpg\" data-file-width=\"3000\" data-file-height=\"2250\" data-file-type=\"bitmap\" height=\"188\" width=\"250\" srcset=\"//upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Dendritic_cell_revealed.jpg/500px-Dendritic_cell_revealed.jpg 2x, //upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Dendritic_cell_revealed.jpg/375px-Dendritic_cell_revealed.jpg 1.5x\">
    <video poster=\"//upload.wikimedia.org/wikipedia/commons/thumb/b/b7/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv/120px--S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.jpg\" preload=\"none\" height=\"115\" width=\"120\" resource=\"./File:S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv\"><source src=\"https://upload.wikimedia.org/wikipedia/commons/b/b7/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv\" type=\"video/ogg; codecs=&quot;theora&quot;\" data-file-width=\"264\" data-file-height=\"254\" data-title=\"Original Ogg file, 264 × 254 (501 kbps)\" data-shorttitle=\"Ogg source\"><source src=\"https://upload.wikimedia.org/wikipedia/commons/transcoded/b/b7/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.120p.vp9.webm\" type=\"video/webm; codecs=&quot;vp9, opus&quot;\" data-width=\"124\" data-height=\"120\" data-title=\"Lowest bandwidth VP9 (120P)\" data-shorttitle=\"VP9 120P\"><source src=\"https://upload.wikimedia.org/wikipedia/commons/transcoded/b/b7/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.160p.webm\" type=\"video/webm; codecs=&quot;vp8, vorbis&quot;\" data-width=\"166\" data-height=\"160\" data-title=\"Low bandwidth WebM (160P)\" data-shorttitle=\"WebM 160P\"><source src=\"https://upload.wikimedia.org/wikipedia/commons/transcoded/b/b7/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.180p.vp9.webm\" type=\"video/webm; codecs=&quot;vp9, opus&quot;\" data-width=\"188\" data-height=\"180\" data-title=\"Low bandwidth VP9 (180P)\" data-shorttitle=\"VP9 180P\"><source src=\"https://upload.wikimedia.org/wikipedia/commons/transcoded/b/b7/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.240p.vp9.webm\" type=\"video/webm; codecs=&quot;vp9, opus&quot;\" data-width=\"250\" data-height=\"240\" data-title=\"Small VP9 (240P)\" data-shorttitle=\"VP9 240P\"><source src=\"https://upload.wikimedia.org/wikipedia/commons/transcoded/b/b7/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.240p.webm\" type=\"video/webm; codecs=&quot;vp8, vorbis&quot;\" data-width=\"250\" data-height=\"240\" data-title=\"Small WebM (240P)\" data-shorttitle=\"WebM 240P\"></video>
`;


test('Article html processing', async (t) => {
    const { downloader, mw, dump } = await setupScrapeClasses(); // en wikipedia
    await downloader.checkCapabilities();
    await downloader.setBaseUrls();
    const _articlesDetail = await downloader.getArticleDetailsIds(['London', 'Non-existent-town']);
    const articlesDetail = mwRetToArticleDetail(_articlesDetail);
    await articleDetailXId.flush();
    await articleDetailXId.setMany(articlesDetail);

    const [{ html }] = await downloader.getArticle('London', dump);

    const addedArticles: typeof ZimArticle[] = [];

    // TODO: use proper spied (like sinon.js)
    await saveArticles({
        addArticle(article: typeof ZimArticle) {
            if (article.mimeType === 'text/html') {
                addedArticles.push(article);
            }
            return Promise.resolve();
        }} as any,
        downloader,
        mw,
        dump,
    );

    t.assert(addedArticles.length === 1 && addedArticles[0].aid === 'A/London' && dump.status.articles.fail === 1, 'Skip non-existent articles');

    const articleDoc = domino.createDocument(addedArticles.shift().bufferData.toString());

    t.assert(articleDoc.querySelector('meta[name="geo.position"]'), 'Geo Position meta exists');
    t.equal(articleDoc.querySelector('meta[name="geo.position"]').getAttribute('content'), '51.50722222;-0.1275', 'Geo Position data is correct');
});

test('applyOtherTreatments', async (t) => {
    const { downloader, mw, dump } = await setupScrapeClasses({ mwUrl: 'https://en.wikivoyage.org' }); // en wikipedia
    await downloader.checkCapabilities();
    await downloader.setBaseUrls();
    const _articleDetailsRet = await downloader.getArticleDetailsIds(['Western_Greenland']);
    const articlesDetail = mwRetToArticleDetail(_articleDetailsRet);
    articleDetailXId.setMany(articlesDetail);
    const [{ html }] = await downloader.getArticle('Western_Greenland', dump);

    {
        const doc = domino.createDocument(html);
        await applyOtherTreatments(doc, dump);

        const details = Array.from(doc.querySelectorAll('details'));

        let fewestChildren = null;
        for (const d of details) {
            if (fewestChildren === null || d.children.length < fewestChildren) {
                fewestChildren = d.children.length;
            }
        }
        if (fewestChildren < 1) {
            t.fail(`Found empty details elements when they should be stripped in mobile view`);
        } else {
            t.ok(`Found no empty details elements when they should be stripped in mobile view`);
        }
    }

    const dump2 = new Dump('', { keepEmptyParagraphs: true } as any, dump.mwMetaData);
    {
        const doc = domino.createDocument(html);
        await applyOtherTreatments(doc, dump2);

        const details = Array.from(doc.querySelectorAll('details'));

        let fewestChildren = null;
        for (const d of details) {
            if (fewestChildren === null || d.children.length < fewestChildren) {
                fewestChildren = d.children.length;
            }
        }
        if (fewestChildren <= 1) {
            t.ok(`Found empty details elements when they should be left im mobile view`);
        } else {
            t.fail(`Empty details elements were stripped when they shouldn't be in mobile view`);
        }
    }

    {
        const doc = domino.createDocument(html);
        await applyOtherTreatments(doc, dump2);

        const sections = Array.from(doc.querySelectorAll('section'));

        let fewestChildren = null;
        for (const d of sections) {
            if (fewestChildren === null || d.children.length < fewestChildren) {
                fewestChildren = d.children.length;
            }
        }
        if (fewestChildren <= 1) {
            t.ok(`Found empty sections when they should be left im desktop view`);
        } else {
            t.fail(`Found no empty sections when they should be left in desktop view`);
        }
    }
});

test('treatMedias format=""', async (t) => {
    const { downloader, mw, dump } = await setupScrapeClasses({ format: '' }); // en wikipedia

    const doc = domino.createDocument(html);

    const ret = await treatMedias(doc, mw, dump, 'Dendritic_cell', downloader);

    const videoEl = ret.doc.querySelector('video');
    const videoPosterUrl = videoEl.getAttribute('poster');
    const sources: any[] = Array.from(videoEl.querySelectorAll('source'));
    const sourceUrl = sources[0].getAttribute('src');

    t.equal(videoPosterUrl, '../I/m/-S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.jpg', 'Video poster correctly re-written');
    t.equal(sourceUrl, '../I/m/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.120p.vp9.webm', 'Source src correctly re-written');

    const imgEl = ret.doc.querySelector('img');
    const imgSrc = imgEl.getAttribute('src');

    t.equal(imgSrc, '../I/m/Dendritic_cell_revealed.jpg', 'Img src correctly re-written');
});

test('treatMedias format="nopic"', async (t) => {
    const { downloader, mw, dump } = await setupScrapeClasses({ format: 'nopic' }); // en wikipedia

    const doc = domino.createDocument(html);

    const ret = await treatMedias(doc, mw, dump, 'Dendritic_cell', downloader);

    const videoEl = ret.doc.querySelector('video');
    const imgEl = ret.doc.querySelector('img');

    t.equals(videoEl, undefined, 'Video element removed in nopic');
    t.equals(imgEl, undefined, 'Img element removed in nopic');
});

test('treatMedias format="novid"', async (t) => {
    const { downloader, mw, dump } = await setupScrapeClasses({ format: 'novid' }); // en wikipedia

    const doc = domino.createDocument(html);

    const ret = await treatMedias(doc, mw, dump, 'Dendritic_cell', downloader);

    const videoEl = ret.doc.querySelector('video');
    const imgEl = ret.doc.querySelector('img');

    t.equals(videoEl, undefined, 'Video element removed in novid');
    t.ok(!!imgEl, 'Img element not removed in novid');
});

test('--customFlavour', async (t) => {
    const { downloader, mw, dump } = await setupScrapeClasses({ format: 'nopic' }); // en wikipedia
    await downloader.checkCapabilities();
    await downloader.setBaseUrls();
    class CustomFlavour implements CustomProcessor {
        public async shouldKeepArticle(articleId: string, doc: Document) {
            return articleId !== 'London';
        }
        public async preProcessArticle(articleId: string, doc: Document) {
            if (articleId === 'Paris') {
                const h2 = doc.createElement('h2');
                h2.textContent = 'INSERTED_BY_PRE_PROCESSOR';
                h2.id = 'PRE_PROCESSOR';
                doc.body.appendChild(h2);
            }
            return doc;
        }
        public async postProcessArticle(articleId: string, doc: Document) {
            if (articleId === 'Prague') {
                const h2 = doc.createElement('h2');
                h2.textContent = 'INSERTED_BY_POST_PROCESSOR';
                h2.id = 'POST_PROCESSOR';
                doc.body.appendChild(h2);
            }
            return doc;
        }
    }
    const customFlavour = new CustomFlavour();
    dump.customProcessor = customFlavour;

    const _articlesDetail = await downloader.getArticleDetailsIds(['London', 'Paris', 'Prague']);
    const articlesDetail = mwRetToArticleDetail(_articlesDetail);
    await articleDetailXId.flush();
    await articleDetailXId.setMany(articlesDetail);

    const writtenArticles: any = {};
    await saveArticles({
        addArticle(article: typeof ZimArticle) {
            if (article.mimeType === 'text/html') {
                writtenArticles[article.title] = article;
            }
            return Promise.resolve();
        },
    } as any,
        downloader,
        mw,
        dump,
    );

    const ParisDocument = domino.createDocument(writtenArticles.Paris.bufferData);
    const PragueDocument = domino.createDocument(writtenArticles.Prague.bufferData);

    t.ok(!writtenArticles.London, `London was correctly filtered out by customFlavour`);
    t.ok(ParisDocument.querySelector('#PRE_PROCESSOR'), `Paris was correctly pre-processed`);
    t.ok(PragueDocument.querySelector('#POST_PROCESSOR'), `Prague was correctly post-processed`);
});

test('treat one subtitle', async(t) => {
    const { downloader, mw, dump } = await setupScrapeClasses({ format: '' });

    // Wikicode is taken from article "Mechanical energy" which has a video with subtitle
    const wikicode = `[[File:Physicsworks.ogv|thumb|200px|alt="Lecture demonstrating conservation of mechanical energy"|MIT professor [[Walter Lewin]] demonstrating conservation of mechanical energy]]`;
    const htmlStr = await convertWikicodeToHtml(wikicode, dump.mwMetaData.baseUrl);

    const htmlDoc = domino.createDocument(htmlStr.data);
    const contentRes = await treatSubtitle(htmlDoc.querySelector('track'), mw, 'Mechanical energy');
    testHtmlRewritingE2e(t, wikicode, htmlStr.data, 'Converted wikicode to HTML for one subtitle');
    t.equals(contentRes, 'https://commons.wikimedia.org/w/api.php?action=timedtext&title=File%3APhysicsworks.ogv&lang=en&trackformat=vtt&origin=*', 'Video subtitle rewriting matches');
});

test('treat multiple subtitles in one video', async(t) => {
    const { downloader, mw, dump } = await setupScrapeClasses({ format: '' });

    // Wikicode is taken from article "User:Charliechlorine/sandbox" which has multiple(4) subtitles in this video
    const wikicode = `[[File:Videoonwikipedia.ogv|thumb|thumbtime=0:58|left|320px|Video about kola nuts ]]`;
    const htmlStr = await convertWikicodeToHtml(wikicode, dump.mwMetaData.baseUrl);

    const htmlDoc = domino.createDocument(htmlStr.data);
    const contentRes = await treatVideo(mw, dump, {}, 'User:Charliechlorine/sandbox', htmlDoc.querySelector('video'), false);
    testHtmlRewritingE2e(t, wikicode, htmlStr.data, 'Converted wikicode to HTML for multiple subtitle');
    t.deepEqual(
        contentRes.subtitles,
        [ 'https://commons.wikimedia.org/w/api.php?action=timedtext&title=File%3AVideoonwikipedia.ogv&lang=en&trackformat=vtt&origin=*',
        'https://commons.wikimedia.org/w/api.php?action=timedtext&title=File%3AVideoonwikipedia.ogv&lang=eu&trackformat=vtt&origin=*',
        'https://commons.wikimedia.org/w/api.php?action=timedtext&title=File%3AVideoonwikipedia.ogv&lang=fr&trackformat=vtt&origin=*',
        'https://commons.wikimedia.org/w/api.php?action=timedtext&title=File%3AVideoonwikipedia.ogv&lang=sv&trackformat=vtt&origin=*' ],
        'Video multiple subtitles rewriting matches');
    t.equals(contentRes.subtitles.length, 4, 'All subtitles are found for this video');
});
