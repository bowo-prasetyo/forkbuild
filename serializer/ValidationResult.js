// Pure data: the result of validating JSON before trusting it as a real
// World or Document. Small today — a valid document currently produces
// zero warnings — but the shape exists now so future protocol evolution
// (partial validity, deprecation notices, migration hints) doesn't need
// a new type later, just more populated fields.
//
// Static factories named ok()/fail() rather than valid()/invalid(), to
// avoid reading oddly next to the instance getter: ValidationResult.ok()
// vs result.valid is unambiguous; ValidationResult.valid() vs
// result.valid would not have been.
export class ValidationResult {
    constructor({ valid = true, errors = [], warnings = [] } = {}) {
        this._valid = valid;
        this._errors = errors;
        this._warnings = warnings;
    }

    get valid() {
        return this._valid;
    }

    get errors() {
        return this._errors;
    }

    get warnings() {
        return this._warnings;
    }

    static ok(warnings = []) {
        return new ValidationResult({ valid: true, errors: [], warnings });
    }

    static fail(errors, warnings = []) {
        return new ValidationResult({ valid: false, errors, warnings });
    }
}
