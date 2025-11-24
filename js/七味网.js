/**
 * 七味网(qwmkv.com) - 网盘+在线播放提取脚本 - v11.3 (前端分页优化版)
 *
 * 基于 v11.3 修改：
 * - 将搜索分页逻辑和缓存控制从后端迁移到前端，参考海绵小站插件设计。
 * - 新增前端 searchCache，减少对后端的重复请求，显著降低后端压力。
 * 
 * 【⭐ 新增功能】
 * - 统一 115 域名：将 115cdn.com 转换为 115.com。
 * - 清理尾部特殊符号：移除链接末尾所有非字母数字的特殊符号。
 * 
 * 【✅ 优化】
 * - 确保链接清理逻辑仅应用于包含 "115" 关键字的链接。
 * - 优化网盘命名逻辑为最简化模式：帖子名 + 规格关键词（如果有），否则仅帖子名。
 * - 修复规格匹配 bug，防止出现 `.g` 等错误匹配。
 * - 只对天翼网盘添加访问码拼接格式。
 */

// ================== 🔴 配置区 🔴 ==================
const cheerio = createCheerio();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';
// ★★★ 请务必将这里的IP地址修改为您后端服务器的实际IP地址 ★★★
const BACKEND_API_URL = 'http://192.168.1.3:3002/get-search-html'; // ★ 请修改为您的后端IP

const appConfig = {
    ver: 11.0, // 版本号保持与原始一致
    title: '七味网(纯盘   )',
    site: 'https://www.qnmp4.com',
    tabs: [
        { name: '电影', ext: { id: '/vt/1.html' } },
        { name: '剧集', ext: { id: '/vt/2.html' } },
        { name: '综艺', ext: { id: '/vt/3.html' } },
        { name: '动漫', ext: { id: '/vt/4.html' } },
    ],
};

// ================== 辅助函数 ==================
function log(msg) {
    try {
        $log(`[七味网 v11.0] ${msg}`);
    } catch (_) {
        console.log(`[七味网 v11.0] ${msg}`);
    }
}

function argsify(ext) {
    if (typeof ext === 'string') {
        try {
            return JSON.parse(ext);
        } catch (e) {
            return {};
        }
    }
    return ext || {};
}

function jsonify(data) {
    return JSON.stringify(data);
}

async function fetchOriginalSite(url) {
    const headers = { 'User-Agent': UA };
    log(`直连请求URL: ${url}`);
    return $fetch.get(url, { headers });
}

// ================== 核心实现 ==================
async function init(ext) {
    return jsonify({});
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const page = ext.page || 1;
    const pagePath = page === 1 ? ext.id : ext.id.replace('.html', `-${page}.html`);
    const url = `${appConfig.site}${pagePath}`;

    try {
        const fetchResult = await fetchOriginalSite(url);
        const html = fetchResult.data;
        const $ = cheerio.load(html);
        const cards = [];

        $('ul.content-list > li').each((_, element) => {
            const $li = $(element);
            const vod_id = $li.find('a').first().attr('href');
            const vod_name = $li.find('h3 > a').attr('title');
            const vod_pic = $li.find('div.li-img img').attr('src');
            const vod_remarks = $li.find('span.bottom2').text().trim();

            if (vod_id && vod_name) {
                cards.push({ vod_id, vod_name, vod_pic, vod_remarks, ext: { url: vod_id } });
            }
        });

        log(`获取到 ${cards.length} 条卡片数据。`);
        return jsonify({ list: cards, page: page, pagecount: page + (cards.length > 0 ? 1 : 0) });
    } catch (e) {
        log(`❌ 获取卡片列表异常: ${e.message}`);
        return jsonify({ list: [] });
    }
}

async function getTracks(ext) {
    ext = argsify(ext);
    const url = `${appConfig.site}${ext.url}`;
    try {
        const fetchResult = await fetchOriginalSite(url);
        const html = fetchResult.data;
        const $ = cheerio.load(html);
        const vod_name = $('div.main-ui-meta h1').text().replace(/\(\d+\)$/, '').trim();
        const tracks = [];

        // ========= ① 网盘下载逻辑（已修改，新增链接清理） =========
        const panDownloadArea = $('h2:contains("网盘下载")').parent();
        if (panDownloadArea.length > 0) {
            const panTypes = [];
            panDownloadArea.find('.nav-tabs .title').each((_, el) => {
                panTypes.push($(el).text().trim());
            });

            panDownloadArea.find('.down-list.tab-content > ul.content').each((index, ul) => {
                const panType = panTypes[index] || '未知网盘';
                const groupTracks = [];

                $(ul).find('li.down-list2').each((_, li) => {
                    const $block = $(li).find('p.down-list3');
                    let $a = $block.find('a[href]').first();

                    if (!$a || !$a.attr('href')) {
                        $a = $(li).find('a[href*="cloud.189.cn"]').first();
                        if (!$a || !$a.attr('href')) {
                            $a = $(li).find('a:contains("天翼")').first();
                        }
                    }

                    const originalTitle = ($a && ($a.attr('title') || $a.text())) || $block.text().trim();
                    let linkUrl = $a && $a.attr('href');

                    if (!linkUrl) {
                        const oc = [$(li).attr('onclick') || '', $block.attr('onclick') || ''].join(' ');
                        const durl = $(li).attr('data-url') || $(li).attr('data-href') || '';
                        linkUrl = (oc.match(/https?:\/\/[^\s'"）)]+/i) || [])[0] || durl;
                        if (!linkUrl) {
                            const text = $block.text();
                            linkUrl = (text.match(/https?:\/\/[^\s'"）)]+/i) || [])[0] || (text.match(/\/\/cloud\.189\.cn[^\s'"）)]+/i) || [])[0];
                        }
                    }

                    if (linkUrl && linkUrl.startsWith('//')) {
                        linkUrl = 'https:' + linkUrl;
                    }

                    if (linkUrl && !/^https?:\/\//i.test(linkUrl)) {
                        try {
                            linkUrl = new URL(linkUrl, appConfig.site).toString();
                        } catch (_) {}
                    }

                    // 1. 网盘链接统一域名 115.com
                    if (linkUrl && linkUrl.includes('115')) {
                        linkUrl = linkUrl.replace('115cdn.com', '115.com');
                        linkUrl = linkUrl.replace(/[^a-zA-Z0-9]+$/, '');
                    }

                    // 2. 天翼网盘提取访问码
                    if (linkUrl && linkUrl.includes('cloud.189.cn')) {
                        const m = linkUrl.match(/cloud\.189\.cn\/web\/share\?code=([A-Za-z0-9]+)/i);
                        if (m) {
                            linkUrl = `https://cloud.189.cn/t/${m[1]}`;
                        }
                    }

                    // 【⭐ 修复：严格匹配规格关键词，防止错误匹配 .g 等】
                    let cleanedTitle = originalTitle;
                    cleanedTitle = cleanedTitle.replace(/\(《[^》]+》【[^】]+】提\.\.\.\)/, '').trim();

                    // 3. 【主要优化】规格匹配
                    let spec = '';
                    const specMatch = cleanedTitle.match(
                        /(\d{3,4}p|4K|2160p|1080p|720p|HDR|DV|合集|杜比|高码|内封|次世代|特效|字幕|原盘|REMUX|\d{1,3}(?:\.\d+)?G[B]?)\b/ig
                    );

                    if (specMatch) {
                        const filteredSpecs = specMatch.filter(spec => {
                            // 仅保留规格相关内容，过滤类似 ".g"、".G" 等错误匹配项
                            return !/^[^\w]+$/.test(spec) && spec.length > 1;
                        });

                        const cleanedSpecs = filteredSpecs.map(spec => {
                            // 去除类似 ".g" 的后缀
                            return spec.replace(/\.(g|G)/, '').trim();
                        }).filter(spec => spec);

                        spec = cleanedSpecs.join(' ').replace(/\s+/g, ' ') || '';
                    }

                    // 【修复】去除名称末尾的 [xx] 等网盘标识
                    cleanedTitle = cleanedTitle.replace(/\[\w+\]$/, '').trim();

                    const trackName = spec
                        ? `${vod_name} [${spec}]`
                        : vod_name; // 简化为仅帖子名

                    // 【修复】提取访问码
                    let pwd = '';
                    const pwdMatch = (linkUrl && linkUrl.match(/[?&](?:pwd|pass|code)=([A-Za-z0-9_-]+)/i)) || originalTitle.match(/(?:提取码|访问码|密码|码)[：:\s]*([A-Za-z0-9_-]{4,10})/i);
                    if (pwdMatch) pwd = pwdMatch[1];

                    // 【修复】只对天翼网盘添加访问码前缀
                    let finalLink = linkUrl || '';
                    if (pwd && (finalLink.includes('cloud.189.cn') || originalTitle.includes('天翼'))) {
                        finalLink = `${finalLink}（访问码：${pwd}）`;
                    }

                    groupTracks.push({ name: trackName, pan: finalLink, ext: { pwd: pwd } });
                });

                if (groupTracks.length > 0) {
                    tracks.push({ title: panType, tracks: groupTracks });
                }
            });
        }

        // ========= ② 修复后：在线播放分组 =========
        const onlineSection = $('#url .sBox');
        if (onlineSection.length > 0) {
            const tabNames = [];
            onlineSection.find('.py-tabs li').each((_, tab) => {
                const tabText = $(tab).text().trim().split('\n')[0]; // 去掉数字部分
                tabNames.push(tabText);
            });

            onlineSection.find('.bd ul.player').each((index, ul) => {
                const groupTracksOnline = [];
                $(ul).find('li a').each((_, a) => {
                    const $a = $(a);
                    const name = $a.text().trim();
                    const playUrl = $a.attr('href');
                    if (name && playUrl) {
                        groupTracksOnline.push({ name, pan: playUrl, ext: { play: true } });
                    }
                });

                if (groupTracksOnline.length > 0) {
                    const tabName = tabNames[index] || `播放源${index + 1}`;
                    tracks.push({ title: `在线播放-${tabName}`, tracks: groupTracksOnline });
                }
            });
        }

        log(`获取到 ${tracks.length} 条播放资源。`);
        return jsonify({ list: tracks });
    } catch (e) {
        log(`❌ 获取详情数据异常: ${e.message}`);
        $toast(`搜索失败: ${e.message}`);
        // 返回当前页缓存页数，防止UI出错
        return jsonify({ list: [], page: ext.page, pagecount: searchCache.pagecount || ext.page });
    }
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const playUrl = ext.pan;

    try {
        const fetchResult = await fetchOriginalSite(playUrl);
        const html = fetchResult.data;
        const $ = cheerio.load(html);
        let playUrlFinal = $('iframe').attr('src') || $('video source').attr('src') || $('video').attr('src');

        if (!playUrlFinal) playUrlFinal = playUrl;

        return jsonify({ urls: [playUrlFinal] });
    } catch (e) {
        log(`❌ 解析在线播放失败: ${e.message}`);
        return jsonify({ urls: [] });
    }
}

// ================== 搜索逻辑 (★ MODIFIED ★ - 移植海绵小站模式) ==================
const searchCache = { keyword: null, data: [], pagecount: 0 }; // 新增前端搜索缓存对象

async function search(ext) {
    ext = argsify(ext);
    const keyword = ext.text || '';
    const page = ext.page || 1;

    if (!keyword.trim()) {
        log('检测到无关键词的搜索调用，返回空列表。');
        return jsonify({ list: [], page: 1, pagecount: 1 });
    }

    // 如果是新关键词，重置缓存
    if (searchCache.keyword !== keyword) {
        log(`新关键词 "${keyword}"，重置缓存。`);
        searchCache.keyword = keyword;
        searchCache.data = [];
        searchCache.pagecount = 0;
    }

    // 如果缓存命中，直接返回
    if (searchCache.data && searchCache.data[page - 1]) {
        log(`命中缓存: "${keyword}" 第 ${page} 页。`);
        return jsonify({
            list: searchCache.data[page - 1],
            page: page,
            pagecount: searchCache.pagecount
        });
    }

    // 如果页码超出总页数，返回空列表
    if (searchCache.pagecount > 0 && page > searchCache.pagecount) {
        log(`请求页码 ${page} 超出总页数 ${searchCache.pagecount}，返回空列表。`);
        return jsonify({ list: [], page: page, pagecount: searchCache.pagecount });
    }

    log(`缓存未命中，开始请求后端: "${keyword}", 页码: ${page}`);
    const encodedKeyword = encodeURIComponent(keyword);
    const targetSearchUrl = `${appConfig.site}/vs/${encodedKeyword}----------${page}---.html`;

    try {
        const response = await $fetch.post(BACKEND_API_URL, 
            { search_url: targetSearchUrl, requested_page: page },
            { headers: { 'Content-Type': 'application/json' } }
        );

        let resultData;
        try {
            resultData = JSON.parse(response.data);
        } catch (parseError) {
            log(`JSON.parse 失败，直接使用 response.data: ${parseError.message}`);
            resultData = response.data;
        }

        if (!resultData || typeof resultData !== 'object' || !resultData.html || !resultData.paginationInfo) {
            if (resultData && resultData.error) {
                throw new Error(`后端返回错误: ${resultData.error}`);
            } else {
                throw new Error("前端收到的数据格式不正确或缺少关键字段。");
            }
        }

        const html = resultData.html;
        const paginationInfo = resultData.paginationInfo;

        const $ = cheerio.load(html);
        const cards = [];

        $('div.sr_lists dl').each((_, element) => {
            const $dl = $(element);
            const vod_id = $dl.find('dt a').attr('href');
            const vod_name = $dl.find('dd p strong a').text().trim();
            const vod_pic = $dl.find('dt a img').attr('src');
            const vod_remarks = $dl.find('dd p span.ss1').text().trim();

            if (vod_id && vod_name) {
                cards.push({ vod_id, vod_name, vod_pic, vod_remarks, ext: { url: vod_id } });
            }
        });

        log(`成功从后端获取并解析到 ${cards.length} 条数据。`);

        // 更新缓存
        if (!searchCache.data) {
            searchCache.data = [];
        }
        searchCache.data[page - 1] = cards;
        searchCache.pagecount = paginationInfo.totalPages || page;

        log(`缓存更新: "${keyword}" 第 ${page} 页数据已存入。当前已知总页数: ${searchCache.pagecount}`);

        return jsonify({
            list: cards,
            page: page,
            pagecount: searchCache.pagecount
        });

    } catch (e) {
        log(`❌ 搜索异常: ${e.message}`);
        $toast(`搜索失败: ${e.message}`);
        // 返回当前页缓存页数，防止UI错乱
        return jsonify({ list: [], page: page, pagecount: searchCache.pagecount || page });
    }
}
