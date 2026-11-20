import { lookup as dnsLookup } from 'dns';
import { BlockList, isIP } from 'net';

/**
 * Connect-time policy for logout webhooks (contract PC6): a target is delivered to only if
 * every address it resolves to is public. Applied to the address actually connected to
 * (pinned lookup), never to the hostname alone, so DNS rebinding cannot swap it afterwards.
 */
// Two lists: net.BlockList matches IPv4 addresses against ::ffff:0:0/96, which would block them all.
const BLOCKED_V4 = new BlockList();
const BLOCKED_V6 = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  BLOCKED_V4.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['2002::', 16],
] as const) {
  BLOCKED_V6.addSubnet(network, prefix, 'ipv6');
}

export const NOT_PUBLIC_MESSAGE = 'Webhook target is not a public address';

/** Strips URL brackets and a zone id, and turns IPv4-mapped IPv6 into the IPv4 address. */
export function normalizeAddress(address: string): string {
  const bare = address.replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  if (isIP(bare) !== 6) {
    return bare;
  }
  // Canonical form (compressed, hex groups) whatever the notation received.
  const canonical = new URL(`http://[${bare}]`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canonical);
  if (!mapped) {
    return canonical;
  }
  const high = parseInt(mapped[1], 16);
  const low = parseInt(mapped[2], 16);
  return `${String(high >> 8)}.${String(high & 0xff)}.${String(low >> 8)}.${String(low & 0xff)}`;
}

export function isPublicAddress(address: string): boolean {
  const normalized = normalizeAddress(address);
  const family = isIP(normalized);
  if (family === 0) {
    return false;
  }
  if (
    family === 4
      ? BLOCKED_V4.check(normalized, 'ipv4')
      : BLOCKED_V6.check(normalized, 'ipv6')
  ) {
    return false;
  }
  // The mapped form itself is in the block list (::ffff:0:0/96): recheck the original too.
  const original = address.replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  return !(isIP(original) === 6 && BLOCKED_V6.check(original, 'ipv6'));
}

export interface ResolvedAddress {
  address: string;
  family: number;
}

export type Resolver = (
  hostname: string,
  options: { all: true },
  callback: (error: Error | null, addresses: ResolvedAddress[]) => void,
) => void;

export type PinnedLookup = (
  hostname: string,
  options: { all?: boolean },
  callback: (
    error: Error | null,
    address: string | ResolvedAddress[],
    family?: number,
  ) => void,
) => void;

/**
 * `lookup` option for the connection: resolves ALL addresses, refuses the hostname if ONE of
 * them is not public, and hands net only the validated addresses to connect to.
 */
export function createPinnedLookup(
  resolve: Resolver = (hostname, options, callback) => {
    dnsLookup(hostname, options, callback);
  },
  isPublic: (address: string) => boolean = isPublicAddress,
): PinnedLookup {
  return (hostname, options, callback) => {
    resolve(hostname, { all: true }, (error, addresses) => {
      if (error) {
        callback(error, options.all ? [] : '');
        return;
      }
      if (
        addresses.length === 0 ||
        !addresses.every((a) => isPublic(a.address))
      ) {
        callback(new Error(NOT_PUBLIC_MESSAGE), options.all ? [] : '');
        return;
      }
      if (options.all) {
        callback(null, addresses);
      } else {
        callback(null, addresses[0].address, addresses[0].family);
      }
    });
  };
}
