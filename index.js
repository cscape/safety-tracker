const { JSDOM } = require('jsdom')
const axios = require('axios')
const querystring = require('querystring')
const { writeFileSync } = require('fs')

const otfdBase = 'https://safetydata.fra.dot.gov'
const otfd = 'https://safetydata.fra.dot.gov/OfficeofSafety/publicsite/on_the_fly_download.aspx'

const handleError = error => console.log(error)
const getYear = () => (new Date().getFullYear()).toString()
const postVarsMerge = (pv, finalStep = false, operator = 'BLF', dataType = 'cas') => (
  (querystring.stringify({
    ...pv,
    __EVENTTARGET: finalStep ? 'ctl00%24ContentPlaceHolder1%24ButtonSubmit' : 'ctl00$ContentPlaceHolder1$Railroad1$dlReportingLevel'
  })) +
  `&ctl00%24ContentPlaceHolder1%24DropDownListTable=${dataType}` +
  `&ctl00%24ContentPlaceHolder1%24InventoryYear1%24sYear=${getYear()}` +
  `&ctl00%24ContentPlaceHolder1%24Railroad1%24dlReportingLevel=Individual+Railroads` +
  (finalStep ? `&ctl00%24ContentPlaceHolder1%24Railroad1%24rr1=${operator}` +
  `&ctl00%24ContentPlaceHolder1%24Railroad1%24SortByRailroadName=SortByRailroadName` +
  `&ctl00%24ContentPlaceHolder1%24ButtonSubmit=` : '') +
  `&ctl00%24ContentPlaceHolder1%24Statesonly1%24DropDownState=` +
  `&ctl00%24ContentPlaceHolder1%24DropDownListOutput=csv` +
  `&ctl00%24ContentPlaceHolder1%24DropDownListCompress=na`
)

const getPostVarsFromResponse = response => {
  const { data } = response
  const { document } = (new JSDOM(data)).window
  const PostVars = {}
  ;[...document.querySelectorAll('input')].map(a => {
    const name = a.getAttribute('name')
    if (name.indexOf('__') !== 0) return

    PostVars[name] = a.getAttribute('value') || '' // __VIEWSTATE: /wePDwULLi3u39nDCJ8...
  })
  return PostVars
}

const getDownloadLinkFromResponse = response => {
  const { data } = response
  const { document } = (new JSDOM(data)).window
  const href = document.getElementById('ContentPlaceHolder1_lnkDownload').getAttribute('href')
  return otfdBase + href
}

const resendOTFD = pv => axios.post(otfd, pv, {
  headers: {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Referer': otfd,
    'Origin': otfdBase,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3600.100 Safari/537.36'
  }
})

const downloadCSV = (url) => axios.get(url)

const saveCSV = response => {
  const { data } = response
  console.log(data)
  writeFileSync('./tmp/latest.csv', data, 'utf8')
  return data
}

(async (operator = 'BLF') => {
  let initialReqData, newReqDataRequired, getLinkReq, csvDownload
  try {
    initialReqData = await axios.get(otfd)
  } catch (err) { handleError(err) }

  const initPostVars = postVarsMerge(
    getPostVarsFromResponse(initialReqData), false
  ) // change reporting level

  try {
    newReqDataRequired = await resendOTFD(initPostVars)
  } catch (err) { handleError(err) }

  const postVars = postVarsMerge(
    getPostVarsFromResponse(newReqDataRequired), true, operator
  ) // hit the submit button

  try {
    getLinkReq = await resendOTFD(postVars)
  } catch (err) { handleError(err) }

  const link = getDownloadLinkFromResponse(getLinkReq)

  try {
    csvDownload = await downloadCSV(link)
  } catch (err) { handleError(err) }

  const csvFinal = saveCSV(csvDownload)
  console.log(csvFinal)
})().then(() => {
  console.log('woo')
})
