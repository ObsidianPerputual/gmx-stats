import Logger from 'console-log-level'
import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import chalk from 'chalk'

const { BigNumber } = ethers
const CHAIN_ID = 56

const levelColor = {
  'debug': 'grey',
  'error': 'red',
  'warn': 'orange',
  'info': 'greenBright'
}
export function getLogger(ns) {
  return Logger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    prefix: level => {
      const prefix = `${new Date().toISOString()} [${ns}] ${level.toUpperCase()}`
      return (chalk[levelColor[level]] || chalk.white)(prefix)
    }
  })
}

const logger = getLogger('helpers')

const defaultFetcher = url => fetch(url).then(res => res.json())
export function useRequest(url, defaultValue, fetcher = defaultFetcher) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState()
  const [data, setData] = useState(defaultValue) 

  useEffect(async () => {
    try {
      setLoading(true)
      const data = await fetcher(url)
      setData(data)
    } catch (ex) {
      setError(ex)
    }
    setLoading(false)
  }, [url])

  return [data, loading, error]
}

export function urlWithParams(url, params) {
  const paramsStr = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&')
  return `${url}?${paramsStr}`
}

export function getProvider() {
  return new ethers.providers.JsonRpcProvider("https://bsc-dataseed1.defibit.io/", CHAIN_ID)
}

const provider = getProvider()

export async function getLatestReliableBlock() {
  const number = await getLatestReliableBlockNumber() - 3
  return await provider.getBlock(number)
}

export async function getLatestReliableBlockNumber() {
    return (await provider.getBlockNumber()) - 3
}

export function getTransaction(hash) {
  return callWithRetry(provider.getTransaction.bind(provider), [hash])
}

export function getTransactions(hashes) {
  return Promise.all(hashes.map(getTransaction))
}

export function getBlock(blockNumber) {
  return callWithRetry(provider.getBlock.bind(provider), [blockNumber])
}

export function getBlocks(numbers) {
  return Promise.all(numbers.map(getBlock))
}

export function findNearest(arr, needle, getter = el => el) {
	let prevEl
	for (const el of arr) {
		if (getter(el) > needle) {
			if (prevEl && getter(el) - needle > needle - getter(prevEl)) {
				return prevEl
			} else {
				return el
			}
		}
		prevEl = el
	}
	return prevEl
}

async function callWithRetry(func, args, maxTries = 10) {
  let i = 0
  while (true) {
    try {
      return await func(...args)
    } catch (ex) {
      i++
      if (i == maxTries) {
        throw ex
      }
    }
  }
}

export async function queryProviderLogs({ fromBlock, toBlock, address, backwards }) {
  logger.info(`query logs fromBlock=%s toBlock=%s blocks length=%s backwards=%s`,
  	fromBlock,
  	toBlock,
  	toBlock - fromBlock,
  	backwards
  )
  const allResult = []
  const MAX = 1000

  let chunkFromBlock
  let chunkToBlock

  if (backwards) {
  	chunkToBlock = toBlock
  	chunkFromBlock = Math.max(fromBlock, toBlock - MAX)
  } else {
	  chunkFromBlock = fromBlock
	  chunkToBlock = Math.min(toBlock, fromBlock + MAX)
  }

  let i = 0
  while (true) {
    logger.info(`requesting ${i} chunk ${chunkFromBlock}-${chunkToBlock}...`)
    let result = await callWithRetry(provider.getLogs.bind(provider), [{
      fromBlock: chunkFromBlock,
      toBlock: chunkToBlock,
      address
    }])
    if (backwards) {
    	result = result.reverse()
    }
    allResult.push(...result)
    i++

    if (!backwards && chunkToBlock === toBlock) {
      logger.info('done')
      break
    }
    if (backwards && chunkFromBlock === fromBlock) {
      logger.info('done')
      break
    }

    if (backwards) {
	    chunkToBlock = chunkFromBlock - 1
	    chunkFromBlock = Math.max(fromBlock, chunkFromBlock - MAX)
    } else {
	    chunkFromBlock = chunkToBlock + 1
	    chunkToBlock = Math.min(toBlock, chunkToBlock + MAX)
    }
  }

  return allResult
}

export function LogRecord(row) {
  return {
    ...row,
    args: JSON.parse(row.args).map(el => {
      if (el && el.type === 'BigNumber') {
        return BigNumber.from(el.hex)
      }
      return el
    })
  }
}

export function UsdgSupplyRecord(row) {
  return {
    ...row,
    supply: BigNumber.from(JSON.parse(row.supply).hex)
  }
}
