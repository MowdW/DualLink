export const isDesktop = (): boolean => {
    return typeof process !== 'undefined' && process.versions != null && process.versions.node != null;
};

export const isMobile = (): boolean => {
    return !isDesktop();
};

export const isElectron = (): boolean => {
    return isDesktop() && typeof (window as any).require !== 'undefined';
};
