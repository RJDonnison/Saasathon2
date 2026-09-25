// PLACEHOLDER: static content. Real version loads the module via api.getModule().
export default function ModuleView() {
  return (
    <section className="rounded-2xl border border-[#dfe5d8] bg-white p-5 shadow-sm">
      <h2 className="mb-2 font-semibold text-[#20271f]">
        Module: Variables and Types
      </h2>
      <p className="text-sm text-[#697266]">
        Declare a variable with <code>let</code> or <code>const</code>. Try
        printing the sum of two numbers.
      </p>
    </section>
  );
}
