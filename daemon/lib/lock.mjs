const locks = new Map();
const pending = new Map();

export async function acquireLock(key, timeout = 5000) {
  if (!locks.has(key)) {
    locks.set(key, false);
  }

  if (!locks.get(key)) {
    locks.set(key, true);
    return true;
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const list = pending.get(key) || [];
      const idx = list.indexOf(resolve);
      if (idx !== -1) list.splice(idx, 1);
      reject(new Error(`Lock timeout: ${key}`));
    }, timeout);

    if (!pending.has(key)) pending.set(key, []);
    pending.get(key).push(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

export function releaseLock(key) {
  locks.set(key, false);
  const list = pending.get(key) || [];
  if (list.length > 0) {
    const next = list.shift();
    locks.set(key, true);
    next();
  }
}
