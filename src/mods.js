const mods_enum = {
    '': 0,
    'NF': 1,
    'EZ': 2,
    'TD': 4,
    'HD': 8,
    'HR': 16,
    'SD': 32,
    'DT': 64,
    'RX': 128,
    'HT': 256,
    'NC': 512,
    'FL': 1024,
    'AT': 2048,
    'SO': 4096,
    'AP': 8192,
    'PF': 16384,
    '4K': 32768,
    '5K': 65536,
    '6K': 131072,
    '7K': 262144,
    '8K': 524288,
    'FI': 1048576,
    'RD': 2097152,
    'LM': 4194304,
    '9K': 16777216,
    '10K': 33554432,
    '1K': 67108864,
    '3K': 134217728,
    '2K': 268435456,
    'V2': 536870912,
}

function getMods(enabled_mods) {
    var return_array = [];
    for (var mod in mods_enum) {
        if ((mods_enum[mod] & enabled_mods) != 0)
            return_array.push(mod)
    }
    return return_array
}

function getModsEnum(mods) {
    let return_value = 0
    mods.forEach(mod => {
        return_value |= mods_enum[mod.toUpperCase()]
    })
    return return_value
}

export { getMods, getModsEnum }