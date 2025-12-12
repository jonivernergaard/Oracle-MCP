export const parseCSV = (csvText) => {
    if (!csvText) return { columns: [], data: [] };
    const lines = csvText.split('\n').filter(l => l.trim());
    if (lines.length === 0) return { columns: [], data: [] };
    
    const parseLine = (line) => {
        const result = [];
        let start = 0;
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            if (line[i] === '"') {
                inQuotes = !inQuotes;
            } else if (line[i] === ',' && !inQuotes) {
                let field = line.substring(start, i);
                if (field.startsWith('"') && field.endsWith('"')) {
                    field = field.substring(1, field.length - 1).replace(/""/g, '"');
                }
                result.push(field);
                start = i + 1;
            }
        }
        let lastField = line.substring(start);
        if (lastField.startsWith('"') && lastField.endsWith('"')) {
            lastField = lastField.substring(1, lastField.length - 1).replace(/""/g, '"');
        }
        result.push(lastField);
        return result;
    };

    const headers = parseLine(lines[0]);
    const data = lines.slice(1).map(line => {
        const values = parseLine(line);
        const row = {};
        headers.forEach((h, i) => {
            row[h] = values[i] || "";
        });
        return row;
    });
    
    return { columns: headers, data: data };
};
